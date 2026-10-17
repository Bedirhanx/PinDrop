-- Messages sent from the Contact page. Anyone may send one; only moderators
-- can read them. Rate limits keep the form from being used for spam.

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references public.profiles (id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  email text not null check (
    char_length(email) <= 254 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
  ),
  topic text not null default 'general'
    check (topic in ('general', 'feedback', 'safety', 'bug', 'partnership')),
  message text not null check (char_length(btrim(message)) between 10 and 3000),
  status text not null default 'new' check (status in ('new', 'read', 'closed')),
  created_at timestamptz not null default now()
);
create index contact_messages_created_idx on public.contact_messages (created_at desc);

create function private.check_contact_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.email := lower(btrim(new.email));
  new.name := btrim(new.name);
  new.message := btrim(new.message);
  if (select count(*) from public.contact_messages
      where email = new.email and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'You’ve already sent a few messages. We’ll reply soon.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;
  if (select count(*) from public.contact_messages
      where created_at > now() - interval '10 minutes') >= 50 then
    raise exception 'We’re receiving a lot of messages. Please try again later.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;
  return new;
end $$;

create trigger contact_messages_check before insert on public.contact_messages
  for each row execute function private.check_contact_message();

alter table public.contact_messages enable row level security;
revoke all on public.contact_messages from anon, authenticated;
revoke execute on function private.check_contact_message() from public, anon, authenticated;

grant insert (name, email, topic, message) on public.contact_messages to anon, authenticated;
grant select, update (status) on public.contact_messages to authenticated;

create policy contact_messages_send on public.contact_messages for insert
  to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
create policy contact_messages_moderators_read on public.contact_messages for select
  to authenticated using (private.is_moderator());
create policy contact_messages_moderators_update on public.contact_messages for update
  to authenticated using (private.is_moderator()) with check (private.is_moderator());
