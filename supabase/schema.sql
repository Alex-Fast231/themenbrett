-- FaSt Themenbrett: Datenbank
-- Im Supabase-Dashboard unter "SQL Editor" komplett einfügen und auf "Run" klicken.
-- Das Skript kann bei Bedarf mehrfach ausgeführt werden.

create extension if not exists pg_net with schema extensions;

-- Interner Bereich, den die App nicht sehen kann (für die Push-Einstellungen)
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.config (
  key   text primary key,
  value text not null
);

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id   uuid primary key references auth.users (id) on delete cascade,
  name text not null
);

create table if not exists public.cards (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 1 and 200),
  topic       text not null default '',
  result      text not null default '',
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  closed_at   timestamptz,
  closed_by   uuid references public.profiles (id),
  deleted_at  timestamptz,
  deleted_by  uuid references public.profiles (id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id),
  -- Wer zuletzt etwas an der Karte gemacht hat (für den Neu-Punkt und die Sortierung)
  activity_at timestamptz not null default now(),
  activity_by uuid references public.profiles (id)
);

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  card_id    uuid not null references public.cards (id) on delete cascade,
  author     uuid references public.profiles (id),
  text       text not null check (length(text) between 1 and 20000),
  created_at timestamptz not null default now(),
  edited_at  timestamptz
);
create index if not exists messages_card_idx on public.messages (card_id, created_at);

create table if not exists public.ideas (
  id         uuid primary key default gen_random_uuid(),
  text       text not null check (length(text) between 1 and 1000),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.card_reads (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  card_id      uuid not null references public.cards (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- Nur angemeldete Nutzer bekommen überhaupt Zugriff auf die Tabellen (anonym: nichts)
revoke all on public.profiles, public.cards, public.messages, public.ideas, public.card_reads, public.push_subscriptions from anon, authenticated;
grant usage on schema public to authenticated;
grant select                         on public.profiles           to authenticated;
grant select, insert, update         on public.cards              to authenticated;
grant select, insert, update         on public.messages           to authenticated;
grant select, insert, delete         on public.ideas              to authenticated;
grant select, insert, update, delete on public.card_reads         to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- Hilfsfunktion: Ist der angemeldete Nutzer einer der beiden?
-- ---------------------------------------------------------------------------

create or replace function public.is_member()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles           enable row level security;
alter table public.cards              enable row level security;
alter table public.messages           enable row level security;
alter table public.ideas              enable row level security;
alter table public.card_reads         enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (public.is_member());

drop policy if exists cards_select on public.cards;
drop policy if exists cards_insert on public.cards;
drop policy if exists cards_update on public.cards;
create policy cards_select on public.cards for select to authenticated using (public.is_member());
create policy cards_insert on public.cards for insert to authenticated with check (public.is_member());
create policy cards_update on public.cards for update to authenticated
  using (public.is_member() and deleted_at is null)
  with check (public.is_member());
-- Kein direktes Löschen: Das läuft über die Funktion delete_card (unten)

drop policy if exists messages_select on public.messages;
drop policy if exists messages_insert on public.messages;
drop policy if exists messages_update on public.messages;
create policy messages_select on public.messages for select to authenticated using (public.is_member());
create policy messages_insert on public.messages for insert to authenticated
  with check (public.is_member() and exists (select 1 from public.cards c where c.id = card_id and c.deleted_at is null));
-- Nachrichten darf nur der Absender bearbeiten
create policy messages_update on public.messages for update to authenticated
  using (public.is_member() and author = auth.uid())
  with check (author = auth.uid());

drop policy if exists ideas_select on public.ideas;
drop policy if exists ideas_insert on public.ideas;
drop policy if exists ideas_delete on public.ideas;
create policy ideas_select on public.ideas for select to authenticated using (public.is_member());
create policy ideas_insert on public.ideas for insert to authenticated with check (public.is_member());
create policy ideas_delete on public.ideas for delete to authenticated using (public.is_member());

drop policy if exists reads_own on public.card_reads;
create policy reads_own on public.card_reads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member());

-- Push-Abos sieht und verwaltet jeder nur für sich selbst
drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member());

-- ---------------------------------------------------------------------------
-- Automatische Felder (Absender, Zeitstempel). Die App kann sie nicht fälschen.
-- ---------------------------------------------------------------------------

create or replace function private.cards_before()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by  := auth.uid();
    new.created_at  := now();
    new.closed_at   := null;
    new.closed_by   := null;
    new.deleted_at  := null;
    new.deleted_by  := null;
  else
    new.id         := old.id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if coalesce(current_setting('app.deleting', true), '') <> 'on' then
      new.deleted_at := old.deleted_at;
      new.deleted_by := old.deleted_by;
    end if;
    if new.closed_at is not null and old.closed_at is null then
      new.closed_at := now();
      new.closed_by := auth.uid();
    elsif new.closed_at is null then
      new.closed_by := null;
    else
      new.closed_at := old.closed_at;
      new.closed_by := old.closed_by;
    end if;
  end if;
  new.updated_at  := now();
  new.updated_by  := auth.uid();
  new.activity_at := now();
  new.activity_by := auth.uid();
  return new;
end $$;

drop trigger if exists cards_before on public.cards;
create trigger cards_before before insert or update on public.cards
  for each row execute function private.cards_before();

create or replace function private.messages_before()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.author     := auth.uid();
    new.created_at := now();
    new.edited_at  := null;
  else
    new.id         := old.id;
    new.card_id    := old.card_id;
    new.author     := old.author;
    new.created_at := old.created_at;
    if new.text is distinct from old.text then
      new.edited_at := now();
    else
      new.edited_at := old.edited_at;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists messages_before on public.messages;
create trigger messages_before before insert or update on public.messages
  for each row execute function private.messages_before();

-- Neue oder bearbeitete Nachricht zählt als Aktivität an der Karte
create or replace function private.messages_after()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.cards set activity_at = now() where id = new.card_id and deleted_at is null;
  return null;
end $$;

drop trigger if exists messages_after on public.messages;
create trigger messages_after after insert or update on public.messages
  for each row execute function private.messages_after();

create or replace function private.ideas_before()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end $$;

drop trigger if exists ideas_before on public.ideas;
create trigger ideas_before before insert on public.ideas
  for each row execute function private.ideas_before();

-- ---------------------------------------------------------------------------
-- Funktionen, die die App aufruft
-- ---------------------------------------------------------------------------

-- Karte löschen: Inhalte weg, nur der Vermerk bleibt
create or replace function public.delete_card(p_card uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_member() then
    raise exception 'Keine Berechtigung';
  end if;
  perform set_config('app.deleting', 'on', true);
  delete from public.messages where card_id = p_card;
  delete from public.card_reads where card_id = p_card;
  update public.cards
     set topic = '', result = '', deleted_at = now(), deleted_by = auth.uid()
   where id = p_card and deleted_at is null;
  perform set_config('app.deleting', 'off', true);
end $$;

-- Karte als gelesen markieren (Zeit vom Server, damit der Punkt zuverlässig ist)
create or replace function public.mark_read(p_card uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_member() then
    raise exception 'Keine Berechtigung';
  end if;
  insert into public.card_reads (user_id, card_id, last_read_at)
  values (auth.uid(), p_card, now())
  on conflict (user_id, card_id) do update set last_read_at = now();
end $$;

-- Push-Abo dieses Geräts speichern (ein Gerät gehört immer dem, der zuletzt angemeldet war)
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_member() then
    raise exception 'Keine Berechtigung';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

revoke all on function public.delete_card(uuid) from public, anon;
revoke all on function public.mark_read(uuid) from public, anon;
revoke all on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.delete_card(uuid) to authenticated;
grant execute on function public.mark_read(uuid) to authenticated;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Push: Bei neuen Sachen die Edge Function "notify" anstoßen
-- (Adresse und Passwort stehen in private.config, siehe supabase/push.sql)
-- ---------------------------------------------------------------------------

create or replace function private.notify_other(p_actor uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select value into v_url    from private.config where key = 'notify_url';
  select value into v_secret from private.config where key = 'notify_secret';
  if v_url is null or v_url = '' or p_actor is null then
    return;
  end if;
  perform net.http_post(
    url     := v_url,
    body    := jsonb_build_object('actor', p_actor),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret)
  );
exception when others then
  -- Push darf nie das Speichern verhindern
  raise warning 'notify_other: %', sqlerrm;
end $$;

create or replace function private.push_messages()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.notify_other(new.author);
  return null;
end $$;

create or replace function private.push_ideas()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.notify_other(new.created_by);
  return null;
end $$;

create or replace function private.push_cards()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.notify_other(new.created_by);
  elsif new.deleted_at is null and (old.closed_at is null) <> (new.closed_at is null) then
    -- abgeschlossen oder wieder geöffnet
    perform private.notify_other(new.updated_by);
  end if;
  return null;
end $$;

drop trigger if exists push_messages on public.messages;
create trigger push_messages after insert on public.messages
  for each row execute function private.push_messages();

drop trigger if exists push_ideas on public.ideas;
create trigger push_ideas after insert on public.ideas
  for each row execute function private.push_ideas();

drop trigger if exists push_cards on public.cards;
create trigger push_cards after insert or update on public.cards
  for each row execute function private.push_cards();

-- ---------------------------------------------------------------------------
-- Live-Aktualisierung
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['cards', 'messages', 'ideas'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
