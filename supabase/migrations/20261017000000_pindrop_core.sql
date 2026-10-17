-- PinDrop core schema: profiles, pins, claims, confirmations, saves, reports,
-- blocks and messages.
--
-- Security model
-- * Every table has Row Level Security on.
-- * Supabase grants all privileges on new public tables to anon and
--   authenticated, so each table revokes them and grants back only what the
--   client needs, column by column where it matters.
-- * Pin status, claims, counters and deletion change only through
--   public.pin_action(), which locks the pin row so two people can never
--   claim the same request.
-- * Helpers live in the "private" schema, which the REST API doesn't expose.

create schema if not exists private;
grant usage on schema private to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Profiles & settings
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Neighbor'
    check (char_length(btrim(display_name)) between 1 and 40),
  is_student_verified boolean not null default false,
  is_moderator boolean not null default false,
  helped_count integer not null default 0 check (helped_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade
    default auth.uid(),
  theme text not null default 'dark' check (theme in ('dark', 'light')),
  nearby_only boolean not null default false,
  show_samples boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Email domains whose owners count as verified students (for example a
-- college's student email domain). Empty by default; add rows to enable.
create table public.verified_email_domains (
  domain text primary key check (domain = lower(domain) and domain !~ '@')
);

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();
create trigger user_settings_touch before update on public.user_settings
  for each row execute function private.touch_updated_at();

create function private.email_is_verified_student(email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.verified_email_domains d
    where d.domain = lower(split_part(coalesce(email, ''), '@', 2))
  )
$$;

-- Creates a profile for every new account. The email address is never used
-- as a public name.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  name text := btrim(coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    ''
  ));
begin
  insert into public.profiles (id, display_name, is_student_verified)
  values (
    new.id,
    case when name = '' then 'Neighbor' else left(name, 40) end,
    private.email_is_verified_student(new.email)
  )
  on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles
  set is_student_verified = private.email_is_verified_student(new.email)
  where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function private.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Pins
-- ---------------------------------------------------------------------------

-- Which community categories each pin type may use (mirrors lib/constants.js).
create function private.valid_type_group(pin_type text, grp text) returns boolean
language sql immutable set search_path = '' as $$
  select case pin_type
    when 'requesting' then grp = any (array['everyday','home','learning','work','care','food','resources','wellness','accessibility','newcomers','environment','culture','animals'])
    when 'offering' then grp = any (array['everyday','home','learning','work','care','food','resources','wellness','accessibility','newcomers','environment','culture','animals'])
    when 'event' then grp = any (array['culture','environment','learning','care','food','wellness','newcomers'])
    when 'place' then grp = any (array['food','resources','wellness','accessibility','newcomers','environment','culture','animals'])
    when 'alert' then grp = any (array['safety','environment','animals'])
    else false
  end
$$;

create function private.valid_tags(tags text[]) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(array_length(tags, 1), 0) <= 12
    and not exists (
      select 1 from unnest(tags) t
      where t is null or char_length(btrim(t)) not between 1 and 60
    )
$$;

create table public.pins (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  type text not null
    check (type in ('requesting', 'offering', 'event', 'place', 'alert')),
  community_category text not null,
  category text not null check (char_length(btrim(category)) between 1 and 80),
  title text not null check (char_length(btrim(title)) between 3 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  -- Public coordinates. For approximate pins these are already blurred: the
  -- exact point is never stored (see private.prepare_pin).
  lat double precision not null check (lat between -85 and 85),
  lng double precision not null check (lng between -180 and 180),
  approximate boolean not null default false,
  place_label text check (char_length(place_label) <= 150),
  payment text not null default 'free'
    check (payment in ('free', 'paid', 'tip', 'barter', 'timeCredit')),
  amount numeric(10, 2) check (amount > 0 and amount < 1000000),
  currency text check (currency in ('USD', 'EUR', 'GBP', 'CAD')),
  exchange_details text check (char_length(exchange_details) <= 300),
  urgency text check (urgency in ('now', 'today', 'week', 'flexible')),
  availability_start date,
  availability_end date,
  starts_at timestamptz,
  ends_at timestamptz,
  expires_at timestamptz,
  hours text check (char_length(hours) <= 200),
  contact_note text check (char_length(contact_note) <= 200),
  skills text[] not null default '{}' check (private.valid_tags(skills)),
  contact_tags text[] not null default '{}' check (private.valid_tags(contact_tags)),
  photo_path text,
  status text not null default 'open'
    check (status in ('open', 'claimed', 'active', 'done', 'cancelled')),
  claimant_id uuid references public.profiles (id) on delete set null,
  confirmations integer not null default 0 check (confirmations >= 0),
  saves integer not null default 0 check (saves >= 0),
  report_count integer not null default 0 check (report_count >= 0),
  last_confirmed_at timestamptz not null default now(),
  hidden_at timestamptz,
  deleted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint pins_type_group check (private.valid_type_group(type, community_category)),
  constraint pins_paid_amount check (
    (payment = 'paid' and amount is not null and currency is not null)
    or (payment <> 'paid' and amount is null)
  ),
  constraint pins_exchange_terms check (
    (payment in ('barter', 'timeCredit') and char_length(btrim(coalesce(exchange_details, ''))) > 0)
    or (payment not in ('barter', 'timeCredit') and exchange_details is null)
  ),
  constraint pins_event_times check (
    (type = 'event' and starts_at is not null and ends_at > starts_at)
    or (type <> 'event' and starts_at is null and ends_at is null)
  ),
  constraint pins_availability check (
    (availability_start is null and availability_end is null)
    or (availability_start is not null and availability_end >= availability_start)
  ),
  -- Photos must be the author's own upload in the pin-photos bucket.
  constraint pins_photo_path check (
    photo_path is null
    or photo_path ~ ('^' || author_id::text || '/[0-9a-f-]{36}\.webp$')
  ),
  constraint pins_claimant check (
    (status in ('claimed', 'active') and claimant_id is not null)
    or (status not in ('claimed', 'active') and claimant_id is null)
  )
);

create index pins_location_idx on public.pins (lat, lng)
  where deleted_at is null and hidden_at is null;
create index pins_author_idx on public.pins (author_id);
create index pins_claimant_idx on public.pins (claimant_id) where claimant_id is not null;
create index pins_created_idx on public.pins (created_at desc);

-- Moves a point to a random spot inside its ~400 m grid cell. Snapping first
-- means repeated posts from the same home average out to the cell, not the
-- home; the random offset means the cell centre isn't a predictable marker.
create function private.blur_location(exact_lat double precision, exact_lng double precision)
returns table (lat double precision, lng double precision)
language plpgsql volatile set search_path = '' as $$
declare
  cell constant double precision := 400;
  lat_step double precision := cell / 111320.0;
  lat_cell double precision := floor(exact_lat / lat_step);
  lng_step double precision :=
    cell / (111320.0 * greatest(0.1, cos(radians((lat_cell + 0.5) * lat_step))));
begin
  return query select
    (lat_cell + 0.15 + 0.7 * random()) * lat_step,
    (floor(exact_lng / lng_step) + 0.15 + 0.7 * random()) * lng_step;
end $$;

-- Validates and normalises a new pin. Runs as the inserting user.
create function private.prepare_pin() returns trigger
language plpgsql set search_path = '' as $$
declare
  recent integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to drop a pin' using errcode = '42501';
  end if;

  select count(*) into recent from public.pins
  where author_id = auth.uid() and created_at > now() - interval '1 hour';
  if recent >= 15 then
    raise exception 'You have dropped a lot of pins recently. Try again in a little while.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;

  new.title := btrim(new.title);
  new.description := btrim(coalesce(new.description, ''));
  new.place_label := nullif(btrim(new.place_label), '');
  new.exchange_details := nullif(btrim(new.exchange_details), '');
  new.hours := nullif(btrim(new.hours), '');
  new.contact_note := nullif(btrim(new.contact_note), '');
  if new.payment <> 'paid' then
    new.amount := null;
    new.currency := null;
  end if;

  if new.approximate then
    select b.lat, b.lng into new.lat, new.lng
    from private.blur_location(new.lat, new.lng) b;
  end if;

  if new.expires_at is null then
    new.expires_at := case
      when new.type = 'alert' then now() + interval '1 day'
      when new.type = 'requesting' then now() + interval '7 days'
    end;
    -- A custom date range keeps the pin visible through its last day.
    if new.expires_at is not null and new.availability_end is not null then
      new.expires_at := greatest(
        new.expires_at,
        (new.availability_end + 1)::timestamptz - interval '1 second'
      );
    end if;
  end if;
  if new.expires_at is not null and new.expires_at <= now() then
    raise exception 'Choose an expiry time in the future' using errcode = '23514';
  end if;
  if new.expires_at > now() + interval '366 days'
     or new.ends_at > now() + interval '366 days' then
    raise exception 'Pins can run for up to a year' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger pins_prepare before insert on public.pins
  for each row execute function private.prepare_pin();

-- ---------------------------------------------------------------------------
-- Claims ("I can help" / "I'm interested")
-- ---------------------------------------------------------------------------

create table public.pin_claims (
  id uuid primary key default gen_random_uuid(),
  pin_id uuid not null references public.pins (id) on delete cascade,
  helper_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'offered'
    check (status in ('offered', 'active', 'completed', 'withdrawn', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

-- The database itself refuses a second live claim on the same pin.
create unique index pin_claims_one_live on public.pin_claims (pin_id)
  where status in ('offered', 'active');
create index pin_claims_helper_idx on public.pin_claims (helper_id);

create trigger pin_claims_touch before update on public.pin_claims
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Confirmations, saves, reports, blocks
-- ---------------------------------------------------------------------------

create table public.pin_confirmations (
  pin_id uuid not null references public.pins (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pin_id, user_id)
);
create index pin_confirmations_user_idx on public.pin_confirmations (user_id);

create table public.saved_pins (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  pin_id uuid not null references public.pins (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, pin_id)
);
create index saved_pins_pin_idx on public.saved_pins (pin_id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  pin_id uuid not null references public.pins (id) on delete cascade,
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  unique (pin_id, reporter_id)
);
create index reports_open_idx on public.reports (created_at) where status = 'open';
create index reports_reporter_idx on public.reports (reporter_id, created_at);

create table public.blocked_users (
  blocker_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.pin_claims (id) on delete cascade,
  pin_id uuid not null references public.pins (id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index messages_claim_idx on public.messages (claim_id, created_at);

-- ---------------------------------------------------------------------------
-- Helpers used by policies and triggers
-- ---------------------------------------------------------------------------

create function private.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocked_users
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  )
$$;

-- True when the current user is the helper on the claim or the pin's author.
create function private.is_claim_participant(claim uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.pin_claims c
    join public.pins p on p.id = c.pin_id
    where c.id = claim and auth.uid() in (c.helper_id, p.author_id)
  )
$$;

create function private.is_pin_author(pin uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.pins where id = pin and author_id = auth.uid())
$$;

create function private.is_moderator() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_moderator from public.profiles where id = auth.uid()), false)
$$;

-- A pin that other people may react to: live, visible and not the user's own.
create function private.check_pin_reaction() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  author uuid;
begin
  select p.author_id into author from public.pins p
  where p.id = new.pin_id and p.deleted_at is null and p.hidden_at is null;
  if author is null then
    raise exception 'This pin no longer exists' using errcode = 'P0002';
  end if;
  if tg_table_name = 'pin_confirmations' and author = new.user_id then
    raise exception 'You cannot confirm your own pin' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger pin_confirmations_check before insert on public.pin_confirmations
  for each row execute function private.check_pin_reaction();
create trigger saved_pins_check before insert on public.saved_pins
  for each row execute function private.check_pin_reaction();

-- Keeps the confirmation and save counters on pins in step.
create function private.count_reaction() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  delta integer := case when tg_op = 'INSERT' then 1 else -1 end;
  pin uuid := case when tg_op = 'INSERT' then new.pin_id else old.pin_id end;
begin
  if tg_table_name = 'pin_confirmations' then
    update public.pins set
      confirmations = greatest(0, confirmations + delta),
      last_confirmed_at = case when delta > 0 then now() else last_confirmed_at end
    where id = pin;
  else
    update public.pins set saves = greatest(0, saves + delta) where id = pin;
  end if;
  return null;
end $$;

create trigger pin_confirmations_count after insert or delete on public.pin_confirmations
  for each row execute function private.count_reaction();
create trigger saved_pins_count after insert or delete on public.saved_pins
  for each row execute function private.count_reaction();

-- Reports: no self-reports, a rate limit, and automatic hiding once three
-- different people have reported a pin (a moderator can restore it).
create function private.check_report() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  author uuid;
  recent integer;
begin
  select p.author_id into author from public.pins p
  where p.id = new.pin_id and p.deleted_at is null;
  if author is null then
    raise exception 'This pin no longer exists' using errcode = 'P0002';
  end if;
  if author = new.reporter_id then
    raise exception 'You cannot report your own pin' using errcode = '42501';
  end if;
  select count(*) into recent from public.reports
  where reporter_id = new.reporter_id and created_at > now() - interval '1 hour';
  if recent >= 10 then
    raise exception 'You have sent several reports recently. Try again later.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;
  new.reason := btrim(new.reason);
  return new;
end $$;

create trigger reports_check before insert on public.reports
  for each row execute function private.check_report();

create function private.count_report() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.pins set
    report_count = report_count + 1,
    hidden_at = case
      when report_count + 1 >= 3 and hidden_at is null then now()
      else hidden_at
    end
  where id = new.pin_id;
  return null;
end $$;

create trigger reports_count after insert on public.reports
  for each row execute function private.count_report();

create function private.check_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  claim public.pin_claims;
  author uuid;
  recent integer;
begin
  select * into claim from public.pin_claims where id = new.claim_id;
  select author_id into author from public.pins where id = claim.pin_id;
  if claim.id is null or new.sender_id not in (claim.helper_id, author) then
    raise exception 'Only the people on this request can message here' using errcode = '42501';
  end if;
  if claim.status not in ('offered', 'active') then
    raise exception 'This conversation is closed' using errcode = '42501';
  end if;
  if private.is_blocked_between(claim.helper_id, author) then
    raise exception 'You can''t message this neighbor' using errcode = '42501';
  end if;
  select count(*) into recent from public.messages
  where sender_id = new.sender_id and created_at > now() - interval '1 minute';
  if recent >= 20 then
    raise exception 'You are sending messages too quickly' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  new.pin_id := claim.pin_id;
  new.body := btrim(new.body);
  return new;
end $$;

create trigger messages_check before insert on public.messages
  for each row execute function private.check_message();

-- ---------------------------------------------------------------------------
-- pin_action: the only way to change a pin's status
-- ---------------------------------------------------------------------------

-- Actions:
--   claim     helper offers to help (requests) or asks for an offer
--   withdraw  helper steps back
--   accept    author accepts the helper → active
--   decline   author turns the helper down → open again
--   complete  author (or the helper, once active) marks it done
--   cancel    author cancels the request
--   reopen    author reopens a done or cancelled pin
--   delete    author removes the pin
create function public.pin_action(pin_id uuid, action text)
returns public.pins
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  p public.pins;
  live public.pin_claims;
  is_author boolean;
  is_helper boolean;
begin
  if me is null then
    raise exception 'Sign in to continue' using errcode = '42501';
  end if;

  -- Lock the row: concurrent actions on the same pin run one at a time.
  select * into p from public.pins where id = pin_action.pin_id for update;
  if p.id is null or p.deleted_at is not null
     or (p.hidden_at is not null and p.author_id <> me) then
    raise exception 'This pin no longer exists' using errcode = 'P0002';
  end if;

  select * into live from public.pin_claims c
  where c.pin_id = p.id and c.status in ('offered', 'active');

  is_author := p.author_id = me;
  is_helper := live.id is not null and live.helper_id = me;

  if action = 'claim' then
    if p.type not in ('requesting', 'offering') then
      raise exception 'This pin can''t be claimed' using errcode = '22023';
    end if;
    if is_author then
      raise exception 'You can''t respond to your own pin' using errcode = '42501';
    end if;
    if p.status <> 'open' then
      raise exception 'Someone has already responded to this pin' using errcode = 'P0001', hint = 'already_claimed';
    end if;
    if p.expires_at is not null and p.expires_at <= now() then
      raise exception 'This pin has expired' using errcode = 'P0001';
    end if;
    if private.is_blocked_between(me, p.author_id) then
      raise exception 'You can''t respond to this pin' using errcode = '42501';
    end if;
    insert into public.pin_claims (pin_id, helper_id) values (p.id, me);
    update public.pins set status = 'claimed', claimant_id = me where id = p.id;

  elsif action = 'withdraw' then
    if not is_helper then
      raise exception 'Only the helper can withdraw' using errcode = '42501';
    end if;
    update public.pin_claims set status = 'withdrawn' where id = live.id;
    update public.pins set status = 'open', claimant_id = null where id = p.id;

  elsif action = 'accept' then
    if not is_author or p.status <> 'claimed' then
      raise exception 'Only the author can accept a pending offer' using errcode = '42501';
    end if;
    update public.pin_claims set status = 'active' where id = live.id;
    update public.pins set status = 'active' where id = p.id;

  elsif action = 'decline' then
    if not is_author or p.status not in ('claimed', 'active') then
      raise exception 'Only the author can decline a helper' using errcode = '42501';
    end if;
    update public.pin_claims set status = 'declined' where id = live.id;
    update public.pins set status = 'open', claimant_id = null where id = p.id;

  elsif action = 'complete' then
    if not ((is_author and p.status in ('claimed', 'active'))
            or (is_helper and p.status = 'active')) then
      raise exception 'You can''t complete this pin yet' using errcode = '42501';
    end if;
    update public.pin_claims set status = 'completed', completed_at = now() where id = live.id;
    update public.profiles set helped_count = helped_count + 1 where id = live.helper_id;
    update public.pins set status = 'done', claimant_id = null where id = p.id;

  elsif action = 'cancel' then
    if not is_author or p.status not in ('open', 'claimed', 'active') then
      raise exception 'Only the author can cancel this pin' using errcode = '42501';
    end if;
    update public.pin_claims set status = 'cancelled' where id = live.id;
    update public.pins set status = 'cancelled', claimant_id = null where id = p.id;

  elsif action = 'reopen' then
    if not is_author or p.status not in ('done', 'cancelled') then
      raise exception 'Only the author can reopen this pin' using errcode = '42501';
    end if;
    if p.expires_at is not null and p.expires_at <= now() then
      raise exception 'This pin has expired' using errcode = 'P0001';
    end if;
    update public.pins set status = 'open' where id = p.id;

  elsif action = 'delete' then
    if not is_author then
      raise exception 'Only the author can delete this pin' using errcode = '42501';
    end if;
    update public.pin_claims set status = 'cancelled' where id = live.id;
    update public.pins set deleted_at = now(), status = case
      when status in ('claimed', 'active') then 'cancelled' else status end,
      claimant_id = null
    where id = p.id;

  else
    raise exception 'Unknown action %', action using errcode = '22023';
  end if;

  update public.pins set version = version + 1, updated_at = now()
  where id = p.id returning * into p;
  return p;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges & Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.verified_email_domains enable row level security;
alter table public.pins enable row level security;
alter table public.pin_claims enable row level security;
alter table public.pin_confirmations enable row level security;
alter table public.saved_pins enable row level security;
alter table public.reports enable row level security;
alter table public.blocked_users enable row level security;
alter table public.messages enable row level security;

revoke all on public.profiles, public.user_settings, public.verified_email_domains,
  public.pins, public.pin_claims, public.pin_confirmations, public.saved_pins,
  public.reports, public.blocked_users, public.messages
  from anon, authenticated;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.is_claim_participant(uuid),
  private.is_pin_author(uuid),
  private.is_moderator()
  to anon, authenticated;
-- Used by pin check constraints and the pin insert trigger, which run as the
-- inserting user.
grant execute on function
  private.valid_type_group(text, text),
  private.valid_tags(text[]),
  private.blur_location(double precision, double precision)
  to authenticated;
revoke execute on function public.pin_action(uuid, text) from public, anon;
grant execute on function public.pin_action(uuid, text) to authenticated;

-- Profiles: public names and badges; people may change only their own name.
grant select (id, display_name, is_student_verified, helped_count, created_at)
  on public.profiles to anon, authenticated;
grant update (display_name) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select
  to anon, authenticated using (true);
create policy profiles_update_own on public.profiles for update
  to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Settings: private to their owner.
grant select, insert (theme, nearby_only, show_samples),
  update (theme, nearby_only, show_samples)
  on public.user_settings to authenticated;
create policy user_settings_own on public.user_settings for all
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Pins: anyone can read live pins; signed-in people can create their own.
-- There is no UPDATE or DELETE grant: changes go through pin_action().
grant select (id, author_id, type, community_category, category, title,
  description, lat, lng, approximate, place_label, payment, amount, currency,
  exchange_details, urgency, availability_start, availability_end, starts_at,
  ends_at, expires_at, hours, contact_note, skills, contact_tags, photo_path,
  status, claimant_id, confirmations, saves, last_confirmed_at, hidden_at,
  version, created_at, updated_at)
  on public.pins to anon, authenticated;
grant insert (type, community_category, category, title, description, lat,
  lng, approximate, place_label, payment, amount, currency, exchange_details,
  urgency, availability_start, availability_end, starts_at, ends_at,
  expires_at, hours, contact_note, skills, contact_tags, photo_path)
  on public.pins to authenticated;
create policy pins_read on public.pins for select to anon, authenticated
  using (deleted_at is null and (hidden_at is null or author_id = auth.uid()));
create policy pins_insert_own on public.pins for insert to authenticated
  with check (author_id = auth.uid());

-- Claims: visible to the helper and the pin's author.
grant select on public.pin_claims to authenticated;
create policy pin_claims_participants on public.pin_claims for select
  to authenticated using (helper_id = auth.uid() or private.is_pin_author(pin_id));

-- Confirmations & saves: private lists, owned by the user.
grant select, insert (pin_id), delete on public.pin_confirmations to authenticated;
create policy pin_confirmations_own on public.pin_confirmations for all
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert (pin_id), delete on public.saved_pins to authenticated;
create policy saved_pins_own on public.saved_pins for all
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Reports: people see their own; moderators see and update all.
grant select, insert (pin_id, reason) on public.reports to authenticated;
grant update (status, reviewed_at, reviewed_by) on public.reports to authenticated;
create policy reports_insert_own on public.reports for insert
  to authenticated with check (reporter_id = auth.uid());
create policy reports_read on public.reports for select to authenticated
  using (reporter_id = auth.uid() or private.is_moderator());
create policy reports_moderate on public.reports for update to authenticated
  using (private.is_moderator()) with check (private.is_moderator());

-- Blocks: owned by the blocker.
grant select, insert (blocked_id), delete on public.blocked_users to authenticated;
create policy blocked_users_own on public.blocked_users for all
  to authenticated using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- Messages: only the two people on a claim can read or write.
grant select, insert (claim_id, pin_id, body) on public.messages to authenticated;
create policy messages_read on public.messages for select to authenticated
  using (private.is_claim_participant(claim_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and private.is_claim_participant(claim_id));

-- ---------------------------------------------------------------------------
-- Supabase-only setup (skipped where Storage or Realtime aren't installed)
-- ---------------------------------------------------------------------------

do $$
begin
  -- Pin photos: public to read, 2 MB WebP only, written into the uploader's
  -- own folder.
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('pin-photos', 'pin-photos', true, 2097152, array['image/webp'])
    on conflict (id) do update set
      public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

    execute $p$
      create policy "pin photos upload own folder" on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'pin-photos'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
      )
    $p$;
    execute $p$
      create policy "pin photos delete own" on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'pin-photos'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
      )
    $p$;
  end if;

  -- Live updates for the map and conversations.
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.pins, public.pin_claims, public.messages;
  end if;
end $$;
