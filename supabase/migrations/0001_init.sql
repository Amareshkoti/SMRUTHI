-- SMRUTI: documents, facts and the assistant conversation, per user.
--
-- Every table here is deny-by-default. RLS is not a nicety in this schema: the
-- app ships the anon key inside its own bundle, in plain text, so these
-- policies are the only thing standing between one user's medical results and
-- everyone else's. A table without RLS enabled is a public table.
--
-- The source document itself is never stored. The server reads the bytes in
-- memory, extracts the rows below, and drops them.

-- ---------------------------------------------------------------- documents
create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- sha256 of the file's bytes, computed by the server. The phone has no stable
  -- id for a picked file, so this is what makes re-adding the same report
  -- update one row instead of duplicating every trend line.
  source_id    text not null,
  title        text not null default 'Report',
  source_name  text not null default '',
  doc_date     date,
  hospital     text not null default '',
  doctor       text not null default '',
  fact_count   integer not null default 0,
  added_at     timestamptz not null default now(),
  unique (user_id, source_id)
);

comment on table public.documents is
  'One row per report read. The file itself is never stored.';

-- ------------------------------------------------------------------- facts
-- value is double precision, not numeric: these are lab readings, already
-- rounded by the instrument that produced them, and they are only ever
-- compared and plotted -- never summed into money.
create table if not exists public.facts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  doc_id           uuid not null references public.documents (id) on delete cascade,
  measured_on      date not null,
  analyte          text not null,
  analyte_printed  text not null default '',
  value            double precision not null,
  unit             text not null default '',
  ref_low          double precision,
  ref_high         double precision,
  doctor           text not null default '',
  hospital         text not null default '',
  created_at       timestamptz not null default now()
);

comment on column public.facts.analyte is
  'The report measurement name after whitespace formatting; no aliases are applied.';
comment on column public.facts.analyte_printed is
  'Exactly as printed on the report, so we can show the user their own words.';

-- The same analyte on the same date from the same document is one reading.
-- Without this, re-uploading a report silently doubles every trend.
create unique index if not exists facts_unique_reading
  on public.facts (doc_id, analyte, measured_on);

-- ---------------------------------------------------------------- messages
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  body        text not null,
  language    text not null default 'en' check (language in ('en', 'hi', 'te')),
  created_at  timestamptz not null default now()
);

comment on table public.messages is
  'The conversation with the assistant. Replayed to the model as context; the server keeps no copy of its own.';

-- ----------------------------------------------------------------- indexes
create index if not exists documents_user_date
  on public.documents (user_id, doc_date desc);
create index if not exists facts_user_analyte_date
  on public.facts (user_id, analyte, measured_on);
create index if not exists messages_user_created
  on public.messages (user_id, created_at);

-- --------------------------------------------------------------------- RLS
alter table public.documents enable row level security;
alter table public.facts     enable row level security;
alter table public.messages  enable row level security;

-- Apply the policies to the table owner as well, which Postgres otherwise
-- exempts. Be clear about what this does NOT do: roles carrying BYPASSRLS --
-- and Supabase's service_role is one -- still read straight past every policy.
-- Nothing in the database can defend against that key leaking, which is why it
-- lives only in server/.env and why this server uses it for exactly one thing:
-- asking the auth endpoint whether a caller's token is real. It never queries
-- these tables.
alter table public.documents force row level security;
alter table public.facts     force row level security;
alter table public.messages  force row level security;

do $$
declare
  t text;
begin
  foreach t in array array['documents', 'facts', 'messages'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);

    -- Four separate policies rather than one FOR ALL: an insert needs
    -- with_check (what you are writing), a select needs using (what you can
    -- see), and conflating them is how rows get written under someone else's id.
    execute format(
      'create policy %I on public.%I for select using (auth.uid() = user_id)',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert with check (auth.uid() = user_id)',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete using (auth.uid() = user_id)',
      t || '_delete_own', t);
  end loop;
end $$;

grant select, insert, update, delete
  on public.documents, public.facts, public.messages
  to authenticated;

-- Simply not granting to `anon` is not enough. Supabase ships ALTER DEFAULT
-- PRIVILEGES that hand `anon` access to new tables in `public`, so an
-- unauthenticated caller reaches the table anyway and is stopped only by RLS
-- returning zero rows. That is a working defence resting on a single layer.
-- Revoking makes the grant a second one: if a policy were ever written wrong,
-- an anonymous caller still could not get past the privilege check.
revoke all on public.documents, public.facts, public.messages from anon;
