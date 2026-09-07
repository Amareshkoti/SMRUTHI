-- Defence in depth for a project where 0001 has already been applied.
--
-- 0001 granted the three tables to `authenticated` and said nothing about
-- `anon`, on the assumption that saying nothing meant no access. It does not:
-- Supabase installs ALTER DEFAULT PRIVILEGES that grant `anon` access to new
-- tables in `public`. Measured against the live project, an anonymous caller
-- with only the publishable key reaches the table and is turned back solely by
-- row-level security returning no rows.
--
-- That is correct behaviour, but it is one layer. The publishable key is
-- readable by anyone who installs the app, so the cost of a single mistaken
-- policy is every user's medical records. Revoking the privilege puts a second
-- lock on the same door.
--
-- Safe to run more than once.

revoke all on public.documents from anon;
revoke all on public.facts     from anon;
revoke all on public.messages  from anon;

-- Signed-in users are unaffected: their access comes from the grant in 0001,
-- and which rows they see is still decided by the policies there.
