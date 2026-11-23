-- 001: initial schema for the team portal (replaces the Google Sheets tabs).
-- Runs inside the schema named by DB_SCHEMA (default public), in one transaction.
-- Column names are the app's field names in snake_case; see server/db/tables.ts.

CREATE TABLE "users" (
  "id" text PRIMARY KEY,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "updated_by" text NOT NULL DEFAULT '',
  "email" text NOT NULL DEFAULT '',
  "name" text NOT NULL DEFAULT '',
  "role" text NOT NULL DEFAULT '',
  "active" boolean,
  "password_hash" text NOT NULL DEFAULT '',
  "must_change_password" boolean,
  "failed_attempts" integer,
  "locked_until" timestamptz,
  "session_version" integer,
  "last_login_at" timestamptz,
  "job_title" text NOT NULL DEFAULT '',
  "can_receive_leads" boolean,
  "calendar_color" text NOT NULL DEFAULT '',
  "meet_link" text NOT NULL DEFAULT ''
);

CREATE TABLE "sessions" (
  "id" text PRIMARY KEY,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "updated_by" text NOT NULL DEFAULT '',
  "token_hash" text NOT NULL DEFAULT '',
  "user_id" text,
  "session_version" integer,
  "csrf_token" text NOT NULL DEFAULT '',
  "expires_at" timestamptz,
  "ip" text NOT NULL DEFAULT '',
  "user_agent" text NOT NULL DEFAULT ''
);

CREATE TABLE "settings" (
  "id" text PRIMARY KEY,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "updated_by" text NOT NULL DEFAULT '',
  "key" text NOT NULL DEFAULT '',
  "value" text NOT NULL DEFAULT ''
);

CREATE TABLE "audit" (
  "id" text PRIMARY KEY,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "updated_by" text NOT NULL DEFAULT '',
  "at" timestamptz,
  "actor_id" text NOT NULL DEFAULT '',
  "action" text NOT NULL DEFAULT '',
  "entity" text NOT NULL DEFAULT '',
  "entity_id" text NOT NULL DEFAULT '',
  "before" jsonb,
  "after" jsonb,
  "ip" text NOT NULL DEFAULT ''
);

CREATE TABLE "meta" (
  "id" text PRIMARY KEY,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "updated_by" text NOT NULL DEFAULT '',
  "key" text NOT NULL DEFAULT '',
  "value" text NOT NULL DEFAULT ''
);

CREATE TABLE "leads" (
  "id" text PRIMARY KEY,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "updated_by" text NOT NULL DEFAULT '',
  "date_added" date,
  "added_by" text NOT NULL DEFAULT '',
  "business_name" text NOT NULL DEFAULT '',
  "category" text NOT NULL DEFAULT '',
  "contact_person" text NOT NULL DEFAULT '',
  "phone" text NOT NULL DEFAULT '',
  "city" text NOT NULL DEFAULT '',
  "website_or_instagram" text NOT NULL DEFAULT '',
  "source" text NOT NULL DEFAULT '',
  "service_interest" text NOT NULL DEFAULT '',
  "place_id" text NOT NULL DEFAULT '',
  "state" text NOT NULL DEFAULT '',
  "searched_at" timestamptz,
  "phone_source" text NOT NULL DEFAULT '',
  "confirmed_at" timestamptz,
  "confirmed_by" text NOT NULL DEFAULT '',
  "assigned_to" text,
  "assigned_at" timestamptz,
  "expires_at" timestamptz,
  "expiry_applies" boolean,
  "timer_stopped_at" timestamptz,
  "contacted" boolean,
  "first_call_date" date,
  "call_outcome" text NOT NULL DEFAULT '',
  "rating" text NOT NULL DEFAULT '',
  "decision_maker" text NOT NULL DEFAULT '',
  "need" text NOT NULL DEFAULT '',
  "next_step" text NOT NULL DEFAULT '',
  "follow_up_date" date,
  "discovery_call_date" date,
  "call_happened" boolean,
  "status" text NOT NULL DEFAULT '',
  "deal_type" text NOT NULL DEFAULT '',
  "deal_value" numeric,
  "client_paid" boolean,
  "commission_paid" numeric,
  "commission_paid_at" timestamptz,
  "notes" text NOT NULL DEFAULT ''
);

CREATE TABLE "call_log" (
  "id" text PRIMARY KEY,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "updated_by" text NOT NULL DEFAULT '',
  "lead_id" text,
  "at" timestamptz,
  "user_id" text,
  "outcome" text NOT NULL DEFAULT '',
  "note" text NOT NULL DEFAULT ''
);

CREATE TABLE "expirations" (
  "id" text PRIMARY KEY,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "updated_by" text NOT NULL DEFAULT '',
  "lead_id" text,
  "assignee_id" text NOT NULL DEFAULT '',
  "assigned_at" timestamptz,
  "expires_at" timestamptz
);

CREATE TABLE "places_claims" (
  "id" text PRIMARY KEY,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "updated_by" text NOT NULL DEFAULT '',
  "year_month" text NOT NULL DEFAULT '',
  "sku" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT '',
  "actor_id" text NOT NULL DEFAULT ''
);

CREATE TABLE "availability" (
  "id" text PRIMARY KEY,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "updated_by" text NOT NULL DEFAULT '',
  "founder_id" text,
  "date" date,
  "start" time,
  "end" time,
  "slot_minutes" integer,
  "repeat_weekly" boolean,
  "repeat_until" date
);

CREATE TABLE "bookings" (
  "id" text PRIMARY KEY,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "updated_by" text NOT NULL DEFAULT '',
  "lead_id" text,
  "founder_id" text,
  "date" date,
  "start" time,
  "end" time,
  "status" text NOT NULL DEFAULT '',
  "client_name" text NOT NULL DEFAULT '',
  "phone" text NOT NULL DEFAULT '',
  "mode" text NOT NULL DEFAULT '',
  "link" text NOT NULL DEFAULT '',
  "notes" text NOT NULL DEFAULT '',
  "booked_by" text NOT NULL DEFAULT '',
  "call_happened" boolean
);

CREATE TABLE "notifications" (
  "id" text PRIMARY KEY,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "updated_by" text NOT NULL DEFAULT '',
  "user_id" text,
  "type" text NOT NULL DEFAULT '',
  "message" text NOT NULL DEFAULT '',
  "ref_id" text NOT NULL DEFAULT '',
  "read_at" timestamptz
);

CREATE TABLE "expenses" (
  "id" text PRIMARY KEY,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "updated_by" text NOT NULL DEFAULT '',
  "date" date,
  "item" text NOT NULL DEFAULT '',
  "amount" numeric,
  "paid_by" text NOT NULL DEFAULT '',
  "project" text NOT NULL DEFAULT '',
  "repaid" boolean
);

CREATE TABLE "projects" (
  "id" text PRIMARY KEY,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "updated_by" text NOT NULL DEFAULT '',
  "name" text NOT NULL DEFAULT '',
  "deal_total" numeric,
  "received" numeric,
  "status" text NOT NULL DEFAULT ''
);

CREATE TABLE "goals" (
  "id" text PRIMARY KEY,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "updated_by" text NOT NULL DEFAULT '',
  "goal" text NOT NULL DEFAULT '',
  "task" text NOT NULL DEFAULT '',
  "owner" text NOT NULL DEFAULT '',
  "support" text NOT NULL DEFAULT '',
  "start" date,
  "deadline" date,
  "status" text NOT NULL DEFAULT '',
  "note" text NOT NULL DEFAULT ''
);

CREATE TABLE "milestones" (
  "id" text PRIMARY KEY,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "updated_by" text NOT NULL DEFAULT '',
  "name" text NOT NULL DEFAULT '',
  "provider" text NOT NULL DEFAULT '',
  "gst_included" boolean,
  "target_override" numeric,
  "notes" text NOT NULL DEFAULT ''
);

CREATE TABLE "milestone_items" (
  "id" text PRIMARY KEY,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "updated_by" text NOT NULL DEFAULT '',
  "milestone_id" text,
  "label" text NOT NULL DEFAULT '',
  "amount" numeric,
  "amount_without_gst" numeric,
  "note" text NOT NULL DEFAULT '',
  "sort_order" integer,
  "paid" boolean,
  "paid_by" text NOT NULL DEFAULT '',
  "paid_amount" numeric,
  "paid_at" timestamptz,
  "expense_id" text NOT NULL DEFAULT ''
);

CREATE TABLE "contributions" (
  "id" text PRIMARY KEY,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "updated_by" text NOT NULL DEFAULT '',
  "date" date,
  "founder" text NOT NULL DEFAULT '',
  "amount" numeric,
  "note" text NOT NULL DEFAULT ''
);


-- ─── Insertion order ────────────────────────────────────────────────────────
-- Sheets kept rows in insertion order and some code relies on it (e.g. "first
-- booking wins"); _seq preserves that order for reads.
ALTER TABLE "users" ADD COLUMN "_seq" bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "sessions" ADD COLUMN "_seq" bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "settings" ADD COLUMN "_seq" bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "audit" ADD COLUMN "_seq" bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "meta" ADD COLUMN "_seq" bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "leads" ADD COLUMN "_seq" bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "call_log" ADD COLUMN "_seq" bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "expirations" ADD COLUMN "_seq" bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "places_claims" ADD COLUMN "_seq" bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "availability" ADD COLUMN "_seq" bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "bookings" ADD COLUMN "_seq" bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "notifications" ADD COLUMN "_seq" bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "expenses" ADD COLUMN "_seq" bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "projects" ADD COLUMN "_seq" bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "goals" ADD COLUMN "_seq" bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "milestones" ADD COLUMN "_seq" bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "milestone_items" ADD COLUMN "_seq" bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "contributions" ADD COLUMN "_seq" bigint GENERATED ALWAYS AS IDENTITY;

-- ─── Extensions ─────────────────────────────────────────────────────────────
-- btree_gist lets one exclusion constraint combine "same founder" (=) with
-- "overlapping time" (&&). On Supabase extensions live in the "extensions" schema.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
    CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
  ELSE
    CREATE EXTENSION IF NOT EXISTS btree_gist;
  END IF;
END $$;

-- ─── Value checks ───────────────────────────────────────────────────────────
ALTER TABLE "users" ADD CONSTRAINT users_role_check CHECK ("role" IN ('super_admin', 'admin', 'employee'));
ALTER TABLE "users" ADD CONSTRAINT users_failed_attempts_check CHECK ("failed_attempts" IS NULL OR "failed_attempts" >= 0);
ALTER TABLE "places_claims" ADD CONSTRAINT places_claims_status_check CHECK ("status" IN ('claimed', 'released'));
ALTER TABLE "leads" ADD CONSTRAINT leads_commission_paid_check CHECK ("commission_paid" IS NULL OR "commission_paid" >= 0);
ALTER TABLE "leads" ADD CONSTRAINT leads_deal_value_check CHECK ("deal_value" IS NULL OR "deal_value" >= 0);
ALTER TABLE "expenses" ADD CONSTRAINT expenses_amount_check CHECK ("amount" IS NULL OR "amount" >= 0);
ALTER TABLE "contributions" ADD CONSTRAINT contributions_amount_check CHECK ("amount" IS NULL OR "amount" >= 0);
ALTER TABLE "availability" ADD CONSTRAINT availability_range_check CHECK ("start" IS NULL OR "end" IS NULL OR "end" > "start");
ALTER TABLE "bookings" ADD CONSTRAINT bookings_range_check CHECK ("end" > "start");
ALTER TABLE "bookings" ALTER COLUMN "date" SET NOT NULL;
ALTER TABLE "bookings" ALTER COLUMN "start" SET NOT NULL;
ALTER TABLE "bookings" ALTER COLUMN "end" SET NOT NULL;
ALTER TABLE "bookings" ALTER COLUMN "founder_id" SET NOT NULL;

-- ─── Uniqueness that used to be "one writer at a time" ─────────────────────
-- One account per email (case-insensitive).
CREATE UNIQUE INDEX users_email_unique ON "users" (lower("email"));
-- One session per token.
CREATE UNIQUE INDEX sessions_token_unique ON "sessions" ("token_hash");
-- One value per setting / seed marker.
CREATE UNIQUE INDEX settings_key_unique ON "settings" ("key");
CREATE UNIQUE INDEX meta_key_unique ON "meta" ("key");
-- One expiry record per lead and deadline (the row id is also `${leadId}:${expiresAt}`).
CREATE UNIQUE INDEX expirations_lead_deadline_unique ON "expirations" ("lead_id", "expires_at");
-- Notifications per event use deterministic ids (expiry:…, expiring:…): the primary key makes them unique.
-- A milestone item's expense is recorded once (commission/payment records cannot be duplicated).
CREATE UNIQUE INDEX milestone_items_expense_unique ON "milestone_items" ("expense_id") WHERE "expense_id" <> '';

-- A Google place becomes at most one lead (atomic "claim" of a place on import).
CREATE UNIQUE INDEX leads_place_unique ON "leads" ("place_id") WHERE "place_id" <> '';

-- No double-booking: a founder's active bookings may not overlap in time.
-- (IST wall-clock date + times; cancelled bookings free the slot.)
ALTER TABLE "bookings" ADD COLUMN "slot" tsrange GENERATED ALWAYS AS (tsrange("date" + "start", "date" + "end", '[)')) STORED;
ALTER TABLE "bookings" ADD CONSTRAINT bookings_no_double_booking
  EXCLUDE USING gist ("founder_id" WITH =, "slot" WITH &&) WHERE ("status" <> 'cancelled');

-- Places monthly usage: one counter row per IST month, checked and incremented
-- in a single statement (see PgDb.claimPlacesCall), so the cap holds under
-- any concurrency. The claims ledger keeps one row per call for the record.
CREATE TABLE "places_usage" (
  "year_month" text PRIMARY KEY,
  "used" integer NOT NULL DEFAULT 0 CHECK ("used" >= 0),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ─── Foreign keys ───────────────────────────────────────────────────────────
-- Users are never deleted by the app (only deactivated). Deleting a lead keeps
-- its history rows (as today) and clears the reference.
ALTER TABLE "sessions" ADD CONSTRAINT sessions_user_fk FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT leads_assigned_to_fk FOREIGN KEY ("assigned_to") REFERENCES "users" ("id") ON DELETE SET NULL;
ALTER TABLE "call_log" ADD CONSTRAINT call_log_lead_fk FOREIGN KEY ("lead_id") REFERENCES "leads" ("id") ON DELETE SET NULL;
ALTER TABLE "call_log" ADD CONSTRAINT call_log_user_fk FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL;
ALTER TABLE "expirations" ADD CONSTRAINT expirations_lead_fk FOREIGN KEY ("lead_id") REFERENCES "leads" ("id") ON DELETE SET NULL;
ALTER TABLE "availability" ADD CONSTRAINT availability_founder_fk FOREIGN KEY ("founder_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT bookings_lead_fk FOREIGN KEY ("lead_id") REFERENCES "leads" ("id") ON DELETE SET NULL;
ALTER TABLE "bookings" ADD CONSTRAINT bookings_founder_fk FOREIGN KEY ("founder_id") REFERENCES "users" ("id");
ALTER TABLE "notifications" ADD CONSTRAINT notifications_user_fk FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "milestone_items" ADD CONSTRAINT milestone_items_milestone_fk FOREIGN KEY ("milestone_id") REFERENCES "milestones" ("id") ON DELETE CASCADE;

-- ─── Indexes for the real queries ───────────────────────────────────────────
CREATE INDEX leads_status_idx ON "leads" ("status");
CREATE INDEX leads_assigned_to_idx ON "leads" ("assigned_to");
CREATE INDEX leads_follow_up_idx ON "leads" ("follow_up_date") WHERE "follow_up_date" IS NOT NULL;
CREATE INDEX call_log_lead_idx ON "call_log" ("lead_id", "at");
CREATE INDEX call_log_user_idx ON "call_log" ("user_id");
CREATE INDEX bookings_founder_time_idx ON "bookings" ("founder_id", "date", "start");
CREATE INDEX bookings_lead_idx ON "bookings" ("lead_id");
CREATE INDEX notifications_user_read_idx ON "notifications" ("user_id", "read_at");
CREATE INDEX sessions_expires_idx ON "sessions" ("expires_at");
CREATE INDEX sessions_user_idx ON "sessions" ("user_id");
CREATE INDEX availability_founder_idx ON "availability" ("founder_id", "date");
CREATE INDEX places_claims_month_idx ON "places_claims" ("year_month", "status");
CREATE INDEX audit_at_idx ON "audit" ("at");
CREATE INDEX expirations_lead_idx ON "expirations" ("lead_id");

-- ─── Audit log is append-only ───────────────────────────────────────────────
CREATE FUNCTION audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'The audit log is append-only' USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER audit_no_update_or_delete BEFORE UPDATE OR DELETE ON "audit" FOR EACH ROW EXECUTE FUNCTION audit_append_only();

-- ─── Row Level Security: on everywhere, no policies (deny by default) ──────
-- The app connects as the table owner, which RLS does not restrict; any other
-- role (anon/authenticated via a Data API, if it were ever enabled) gets nothing.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meta" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "call_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expirations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "places_claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "places_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "availability" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bookings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "goals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "milestones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "milestone_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contributions" ENABLE ROW LEVEL SECURITY;
