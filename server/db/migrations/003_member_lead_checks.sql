-- Team members can run "Check against Google" on leads they added, up to a
-- monthly allowance. A person's own allowance ('' = the Settings default).
-- Additive and idempotent.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lead_check_limit" text NOT NULL DEFAULT '';
