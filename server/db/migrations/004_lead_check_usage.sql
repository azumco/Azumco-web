-- Team members' Google checks: a stored monthly usage counter per person, and
-- when each lead last cost a Google call (the 7-day rule). Additive and
-- idempotent; existing users start at 0 used and the default allowance.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lead_check_month" text NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lead_check_used" integer;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "gc_last_call_at" timestamptz;

-- Leads already checked before this column existed: their last check time.
UPDATE "leads" SET "gc_last_call_at" = "gc_checked_at"
 WHERE "gc_last_call_at" IS NULL AND "gc_status" IN ('matches', 'needs_review', 'reviewed', 'pick', 'not_found') AND "gc_checked_at" IS NOT NULL;
