-- APPLIED to production on 2026-10-05 (as "payment_table_enable_rls").
-- The payments table was created without row-level security, unlike every
-- other inv_* table (RLS on, no policies = no access for anon/authenticated;
-- the app reaches the database with the server-side service role, which
-- bypasses RLS). Without this the receipts were readable through the public
-- API key.
alter table inv_draw_payments enable row level security;
