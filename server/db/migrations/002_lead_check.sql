-- "Check against Google" for leads a person added. Additive only: new columns
-- with safe defaults, nothing dropped or renamed. Idempotent (IF NOT EXISTS,
-- and the backfill only touches rows whose origin is still blank), so the old
-- code keeps working on this schema and a re-run changes nothing.

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "area" text NOT NULL DEFAULT '';
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "origin" text NOT NULL DEFAULT '';
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "gc_status" text NOT NULL DEFAULT '';
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "gc_place_id" text NOT NULL DEFAULT '';
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "gc_fields" text NOT NULL DEFAULT '';
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "gc_candidates" text NOT NULL DEFAULT '';
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "gc_checked_at" timestamptz;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "gc_checked_by" text NOT NULL DEFAULT '';

-- Existing leads: imported from Find clients if they carry a place ID (or the
-- Google source), otherwise added by a person. All start as "not checked".
UPDATE "leads"
   SET "origin" = CASE WHEN "place_id" <> '' OR "source" = 'Google Places' THEN 'find_clients' ELSE 'team' END
 WHERE "origin" = '';
