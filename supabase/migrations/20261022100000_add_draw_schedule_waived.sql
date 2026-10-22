-- A project can be deliberately left without a regular draw schedule (e.g. an
-- early-start or nearly finished project). Data to review reads this flag so it
-- stops listing such projects; the draw-due reminders already ignore any
-- project whose draw_due_type is null. Additive, defaulted, and idempotent.
--
-- Not yet applied. The app works without it (the column is only written when
-- someone picks "No regular schedule"); apply this before using that choice.
alter table public.inv_projects
  add column if not exists draw_schedule_waived boolean not null default false;
