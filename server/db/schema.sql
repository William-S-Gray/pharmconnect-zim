-- ##################################################################
-- PHARMCONNECT ZIM — CANONICAL SCHEMA (Neon Postgres)
--
-- Consolidates the ~25 scattered Supabase SQL files in the repo root and
-- supabase/migrations into one authoritative definition, with every
-- Supabase-specific construct removed:
--
--   auth.users            -> public.app_users (owned by this application)
--   auth.uid()            -> gone; identity is resolved in the API layer
--   RLS policies          -> gone; see the note on the security model below
--   supabase_realtime     -> gone; replaced by LISTEN/NOTIFY + SSE
--   SECURITY DEFINER RPCs -> gone; authorization lives in server/src/lib/authz.js
--
-- SECURITY MODEL CHANGE — read this before adding a table.
--
-- Under Supabase the browser held a Postgres role and RLS was the only
-- thing standing between a user and the data. That is why the repo had
-- 37 auth.uid() call sites and why a single bad policy (see the gate-1
-- audit) exposed every profile in the table.
--
-- Here the browser has no database credentials at all. The API server is
-- the sole client, it connects as one role, and every read and write is
-- authorized in JavaScript before it reaches Postgres. RLS is therefore
-- not merely disabled, it is not the boundary any more. Do not add a
-- policy and assume it protects anything; add the check to authz.js.
--
-- Idempotent. Safe to run more than once.
-- ##################################################################

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS postgis;
-- h3 was not available on Supabase, so h3_index_res8 was maintained by a
-- Node script (pos-sync-agent/h3-backfill.js) that read every pharmacy,
-- computed the cell in JavaScript and wrote each row back one at a time —
-- and had to be remembered after every coordinate change. Neon has the
-- extension, so the trigger below keeps it correct automatically.
CREATE EXTENSION IF NOT EXISTS h3;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('super_admin', 'pharmacy_admin', 'pharmacy_staff');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ==================================================================
-- IDENTITY
-- ==================================================================

-- Replaces auth.users. Supabase owned password hashing, OAuth identity
-- linking and TOTP enrolment; all three now live here.
--
-- password_hash is scrypt (node:crypto), stored as the self-describing
-- string built in server/src/auth/password.js. It is NULL for accounts
-- that only ever signed in through Google.
CREATE TABLE IF NOT EXISTS public.app_users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Normalised to lowercase on the way in (server/src/auth/index.js). The
  -- UNIQUE index below is on LOWER(email) rather than the column, so a
  -- second signup differing only in case is rejected by the database and
  -- not merely by whichever code path remembered to normalise.
  email             TEXT NOT NULL,
  password_hash     TEXT,
  email_verified_at TIMESTAMPTZ,
  last_login_at     TIMESTAMPTZ,
  -- Google OAuth. subject is Google's stable user id ("sub" claim); it is
  -- matched on before email, because an email can be reassigned.
  oauth_provider    TEXT CHECK (oauth_provider IN ('google')),
  oauth_subject     TEXT,
  -- TOTP. secret is only meaningful once confirmed_at is set: enrolment
  -- writes the secret, and the first valid code confirms it.
  mfa_secret        TEXT,
  mfa_confirmed_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (oauth_provider, oauth_subject)
);

-- Opaque server-side sessions rather than self-contained JWTs.
--
-- The gate-1 audit's root cause was a token carrying its own authority:
-- user_metadata rode inside the JWT and the client trusted it. An opaque
-- token carries nothing, so there is nothing in it to forge, and a
-- compromised session can be revoked immediately instead of staying
-- valid until it expires.
--
-- token_hash is SHA-256 of the cookie value; the raw token is never stored.
CREATE TABLE IF NOT EXISTS public.sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  ip_address   TEXT,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_email ON public.app_users (LOWER(email));

CREATE INDEX IF NOT EXISTS idx_sessions_user    ON public.sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON public.sessions (expires_at);

-- Single-use, short-lived tokens for password reset and email verification.
-- Hashed for the same reason sessions are.
CREATE TABLE IF NOT EXISTS public.auth_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  purpose    TEXT NOT NULL CHECK (purpose IN ('password_reset', 'email_verify', 'invite')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON public.auth_tokens (user_id, purpose);


-- ==================================================================
-- CORE DOMAIN
-- ==================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id               UUID PRIMARY KEY REFERENCES public.app_users(id) ON DELETE CASCADE,
  email            TEXT NOT NULL UNIQUE,
  full_name        TEXT,
  avatar_url       TEXT,
  -- Writable only through the admin role-change endpoint, never by the
  -- account holder. This column was the target of the gate-1 escalation.
  global_role      user_role NOT NULL DEFAULT 'pharmacy_staff',
  -- Per-person UI preferences (which digests and alerts they want). Free
  -- JSONB because it is presentation state with no referential meaning;
  -- nothing authorizes off it. The admin settings page previously wrote
  -- these to a `metadata` column on pharmacies that no migration declared,
  -- so every save was silently discarded.
  preferences      JSONB NOT NULL DEFAULT '{}'::jsonb,
  lifecycle_status TEXT NOT NULL DEFAULT 'ACTIVE'
                   CHECK (lifecycle_status IN ('ACTIVE', 'TRASHED', 'DELETED')),
  trashed_at       TIMESTAMPTZ,
  deleted_at       TIMESTAMPTZ,
  last_synced_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_profiles_role      ON public.profiles (global_role);
CREATE INDEX IF NOT EXISTS idx_profiles_lifecycle ON public.profiles (lifecycle_status);

CREATE TABLE IF NOT EXISTS public.pharmacies (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  address          TEXT,
  city             TEXT DEFAULT 'Harare',
  suburb           TEXT,
  phone            TEXT,
  whatsapp_number  TEXT,
  email            TEXT NOT NULL UNIQUE,
  mcaz_license     TEXT,
  status           TEXT NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED')),
  plan_tier        TEXT NOT NULL DEFAULT 'FREE'
                   CHECK (plan_tier IN ('FREE', 'BASIC', 'PRO')),
  is_open_24h      BOOLEAN NOT NULL DEFAULT false,
  operating_hours  JSONB,
  lat              FLOAT8,
  lng              FLOAT8,
  -- Derived from lat/lng by the trigger below. GIST-indexed so radius
  -- search is an index scan instead of the Haversine table scan the
  -- original find_nearby_pharmacies did.
  location_geog    GEOGRAPHY(POINT, 4326),
  h3_index_res8    TEXT,
  -- Security alert preferences. Read and written by LoginAlertSettings
  -- against columns no migration declared; defaulted on so the safe
  -- behaviour is the one you get without configuring anything.
  -- Low-stock alerting. Read and written by AlertSettingsPage against
  -- columns no migration declared, so the settings never persisted.
  alert_phone            TEXT,
  default_threshold      INTEGER NOT NULL DEFAULT 10 CHECK (default_threshold >= 0),
  alert_frequency        TEXT NOT NULL DEFAULT 'daily'
                         CHECK (alert_frequency IN ('realtime', 'daily', 'weekly', 'off')),
  notify_new_device      BOOLEAN NOT NULL DEFAULT true,
  notify_new_location    BOOLEAN NOT NULL DEFAULT true,
  notify_failed_attempt  BOOLEAN NOT NULL DEFAULT true,
  notify_password_change BOOLEAN NOT NULL DEFAULT true,
  lifecycle_status TEXT NOT NULL DEFAULT 'ACTIVE'
                   CHECK (lifecycle_status IN ('ACTIVE', 'TRASHED', 'DELETED')),
  trashed_at       TIMESTAMPTZ,
  deleted_at       TIMESTAMPTZ,
  last_synced_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pharmacies_geog      ON public.pharmacies USING GIST (location_geog);
CREATE INDEX IF NOT EXISTS idx_pharmacies_h3        ON public.pharmacies (h3_index_res8);
CREATE INDEX IF NOT EXISTS idx_pharmacies_city      ON public.pharmacies (LOWER(city));
CREATE INDEX IF NOT EXISTS idx_pharmacies_status    ON public.pharmacies (status);

CREATE TABLE IF NOT EXISTS public.memberships (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.app_users(id)  ON DELETE CASCADE,
  pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  role        user_role NOT NULL DEFAULT 'pharmacy_staff',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, pharmacy_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user     ON public.memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_pharmacy ON public.memberships (pharmacy_id);

-- The drug catalogue. Neither this table nor pharmacy_stock had a
-- CREATE TABLE anywhere in the repo — both were created by hand in the
-- Supabase console — so these definitions are reconstructed from the
-- columns the RPCs and the React pages actually reference. Reconcile
-- against a pg_dump of the live database before trusting them.
CREATE TABLE IF NOT EXISTS public.drugs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UNIQUE so the catalogue seed can upsert by name and stay idempotent,
  -- and so two admins cannot create competing entries for the same drug.
  generic_name          TEXT NOT NULL UNIQUE,
  common_name           TEXT,
  strength              TEXT,
  form                  TEXT,
  category              TEXT,
  drug_class            TEXT,
  brand_names           TEXT[] NOT NULL DEFAULT '{}',
  search_terms          TEXT[] NOT NULL DEFAULT '{}',
  uses                  TEXT[] NOT NULL DEFAULT '{}',
  side_effects          TEXT[] NOT NULL DEFAULT '{}',
  interactions          TEXT[] NOT NULL DEFAULT '{}',
  dosage                TEXT,
  warnings              TEXT,
  storage               TEXT,
  pregnancy             TEXT,
  controlled            BOOLEAN NOT NULL DEFAULT false,
  requires_prescription BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Trigram indexes: the search predicate is a leading-wildcard ILIKE,
-- which btree cannot serve at all.
CREATE INDEX IF NOT EXISTS idx_drugs_generic_trgm ON public.drugs USING GIN (generic_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_drugs_common_trgm  ON public.drugs USING GIN (common_name  gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_drugs_brands       ON public.drugs USING GIN (brand_names);
CREATE INDEX IF NOT EXISTS idx_drugs_terms        ON public.drugs USING GIN (search_terms);
CREATE INDEX IF NOT EXISTS idx_drugs_category     ON public.drugs (category);

CREATE TABLE IF NOT EXISTS public.pharmacy_stock (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id  UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  drug_id      UUID REFERENCES public.drugs(id) ON DELETE SET NULL,
  -- Denormalised so a stock row still renders after a catalogue drug is
  -- removed, and so pharmacies can list items not in the catalogue.
  drug_name    TEXT NOT NULL,
  strength     TEXT,
  form         TEXT,
  quantity     INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit_price   NUMERIC(10,2) CHECK (unit_price IS NULL OR unit_price >= 0),
  threshold    INTEGER NOT NULL DEFAULT 10 CHECK (threshold >= 0),
  is_available BOOLEAN NOT NULL DEFAULT true,
  expiry_date  DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULLS NOT DISTINCT is load-bearing for the bulk import's upsert.
  -- Under the default rule two NULLs never conflict, so every re-import of
  -- an item with no drug_id, strength or form would insert a duplicate
  -- instead of updating the existing row — silently, and once per sync.
  CONSTRAINT pharmacy_stock_identity
    UNIQUE NULLS NOT DISTINCT (pharmacy_id, drug_id, strength, form)
);
CREATE INDEX IF NOT EXISTS idx_stock_pharmacy  ON public.pharmacy_stock (pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_stock_drug      ON public.pharmacy_stock (drug_id);
CREATE INDEX IF NOT EXISTS idx_stock_name_trgm ON public.pharmacy_stock USING GIN (drug_name gin_trgm_ops);
-- Serves the "what is low or out" dashboard query without reading the
-- whole inventory; the vast majority of rows are healthy.
CREATE INDEX IF NOT EXISTS idx_stock_low ON public.pharmacy_stock (pharmacy_id)
  WHERE quantity <= threshold OR NOT is_available;


-- ==================================================================
-- WORKFLOW
-- ==================================================================

CREATE TABLE IF NOT EXISTS public.drug_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id    UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  drug_id        UUID REFERENCES public.drugs(id) ON DELETE SET NULL,
  sender_name    TEXT NOT NULL,
  sender_contact TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'NEW'
                 CHECK (status IN ('NEW', 'CONTACTED', 'COMPLETED')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_drug_requests_pharmacy ON public.drug_requests (pharmacy_id, created_at DESC);

-- Unmet demand: "nobody near me has this", not addressed to any pharmacy.
--
-- The repo defined this as a SECOND, incompatible public.drug_requests --
-- SUPABASE_MIGRATION_RBAC.sql created the pharmacy-directed shape above,
-- smart_search_requests.sql created this one, and because both said
-- CREATE TABLE IF NOT EXISTS whichever migration ran first won while the
-- other silently did nothing. Whichever lost, the code written against it
-- was inserting columns that did not exist. They are two genuinely
-- different features, so they are two tables here.
CREATE TABLE IF NOT EXISTS public.drug_wanted_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_query TEXT NOT NULL,
  city            TEXT,
  contact_info    TEXT,
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING', 'REVIEWED', 'RESTOCKED', 'IGNORED')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wanted_status ON public.drug_wanted_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wanted_city   ON public.drug_wanted_requests (city);

CREATE TABLE IF NOT EXISTS public.drug_reservations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id    UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  drug_id        UUID REFERENCES public.drugs(id) ON DELETE SET NULL,
  drug_name      TEXT NOT NULL,
  patient_name   TEXT NOT NULL,
  patient_phone  TEXT NOT NULL,
  quantity       INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price     NUMERIC(10,2),
  status         TEXT NOT NULL DEFAULT 'PENDING'
                 CHECK (status IN ('PENDING', 'CONTACTED', 'FULFILLED', 'CANCELLED')),
  notes          TEXT,
  reference_code TEXT UNIQUE,
  -- Delivery and hold-expiry were written by ReserveDrugModal against
  -- columns that did not exist in any migration, so every reservation with
  -- delivery selected failed. Declared here rather than dropped, because
  -- the escrow/logistics service in backend-services/ is built around them.
  delivery_required BOOLEAN NOT NULL DEFAULT false,
  delivery_address  TEXT,
  payment_status    TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (payment_status IN ('PENDING', 'PAID', 'REFUNDED', 'FAILED')),
  -- How long the pharmacy holds the item. Defaulted in SQL so the value
  -- comes from the database clock, not from whatever the client believes
  -- the time is.
  reserved_until    TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '3 hours'),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reservations_pharmacy ON public.drug_reservations (pharmacy_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pending_approvals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id  UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  action_type  TEXT NOT NULL CHECK (action_type IN ('CREATE', 'UPDATE', 'DELETE')),
  table_name   TEXT NOT NULL,
  target_id    UUID,
  payload      JSONB NOT NULL,
  status       TEXT NOT NULL DEFAULT 'PENDING'
               CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  notes        TEXT,
  reviewer_id  UUID REFERENCES public.app_users(id),
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approvals_pharmacy ON public.pending_approvals (pharmacy_id, status);

CREATE TABLE IF NOT EXISTS public.delete_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  pharmacy_id  UUID REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  target_table TEXT NOT NULL,
  target_id    UUID NOT NULL,
  status       TEXT NOT NULL DEFAULT 'PENDING'
               CHECK (status IN ('PENDING', 'APPROVED', 'DENIED')),
  reason       TEXT,
  reviewer_id  UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_delete_requests_status ON public.delete_requests (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  role        user_role NOT NULL DEFAULT 'pharmacy_staff',
  invited_by  UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'PENDING'
              CHECK (status IN ('PENDING', 'ACCEPTED', 'EXPIRED')),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email, pharmacy_id)
);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.invitations (LOWER(email), status);

CREATE TABLE IF NOT EXISTS public.notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES public.app_users(id)  ON DELETE CASCADE,
  pharmacy_id  UUID REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  message      TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('INFO', 'WARNING', 'REQUEST', 'APPROVAL')),
  is_read      BOOLEAN NOT NULL DEFAULT false,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A notification addressed to nobody is unreachable by every read path.
  CONSTRAINT notifications_has_audience CHECK (user_id IS NOT NULL OR pharmacy_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_notifications_user     ON public.notifications (user_id, created_at DESC)
  WHERE NOT is_dismissed;
CREATE INDEX IF NOT EXISTS idx_notifications_pharmacy ON public.notifications (pharmacy_id, created_at DESC)
  WHERE NOT is_dismissed;

CREATE TABLE IF NOT EXISTS public.sync_conflicts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES public.app_users(id)  ON DELETE SET NULL,
  pharmacy_id UUID REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  table_name  TEXT NOT NULL,
  record_id   UUID NOT NULL,
  local_data  JSONB NOT NULL,
  server_data JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'PENDING'
              CHECK (status IN ('PENDING', 'RESOLVED', 'DISCARDED')),
  resolved_by UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.escrow_transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID REFERENCES public.drug_reservations(id) ON DELETE SET NULL,
  amount         NUMERIC(10,2) NOT NULL,
  phone          TEXT,
  status         TEXT NOT NULL DEFAULT 'AWAITING_PAYMENT',
  provider_ref   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ==================================================================
-- OBSERVABILITY
-- ==================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  user_id    UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  ip_address TEXT,
  metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user    ON public.audit_logs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.login_attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT NOT NULL,
  ip_address   TEXT,
  success      BOOLEAN NOT NULL DEFAULT false,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON public.login_attempts (LOWER(email), attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip    ON public.login_attempts (ip_address, attempted_at DESC);

CREATE TABLE IF NOT EXISTS public.drug_searches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query        TEXT NOT NULL,
  city         TEXT DEFAULT 'Harare',
  result_count INTEGER NOT NULL DEFAULT 0,
  user_id      UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_drug_searches_query ON public.drug_searches (LOWER(query));
CREATE INDEX IF NOT EXISTS idx_drug_searches_city  ON public.drug_searches (city, created_at DESC);

CREATE TABLE IF NOT EXISTS public.smart_search_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query           TEXT NOT NULL,
  detected_intent TEXT NOT NULL,
  city            TEXT,
  user_id         UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ==================================================================
-- TRIGGERS
-- ==================================================================

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'app_users', 'profiles', 'pharmacies', 'drugs',
    'pharmacy_stock', 'drug_reservations', 'escrow_transactions',
    'drug_wanted_requests'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_touch ON public.%1$I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_touch BEFORE UPDATE ON public.%1$I
       FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t);
  END LOOP;
END $$;

-- Keeps location_geog in step with lat/lng so no write path can leave the
-- spatial index stale. The original migration backfilled this once and
-- left every later update to remember, which they did not.
CREATE OR REPLACE FUNCTION public.sync_pharmacy_geog()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.location_geog  := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
    -- Resolution 8 is roughly 1km hexagons, which is the granularity the
    -- demand heatmap groups by.
    NEW.h3_index_res8  := h3_lat_lng_to_cell(POINT(NEW.lng, NEW.lat), 8)::text;
  ELSE
    NEW.location_geog := NULL;
    NEW.h3_index_res8 := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pharmacies_geog ON public.pharmacies;
CREATE TRIGGER trg_pharmacies_geog
  BEFORE INSERT OR UPDATE OF lat, lng ON public.pharmacies
  FOR EACH ROW EXECUTE FUNCTION public.sync_pharmacy_geog();

-- Reference code for reservations. The original derived it from MD5 of
-- the row id inside a BEFORE INSERT trigger, where NEW.id is still NULL
-- unless the client supplied one — so every code collapsed to the MD5 of
-- the empty string and the UNIQUE constraint rejected the second booking
-- outright. Generated from a fresh random value instead.
CREATE OR REPLACE FUNCTION public.generate_reservation_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.reference_code IS NULL THEN
    NEW.reference_code := 'RX-' || UPPER(ENCODE(gen_random_bytes(4), 'hex'));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_reservation_code ON public.drug_reservations;
CREATE TRIGGER trg_reservation_code
  BEFORE INSERT ON public.drug_reservations
  FOR EACH ROW EXECUTE FUNCTION public.generate_reservation_code();

-- Realtime replacement. Supabase streamed WAL to the browser over its
-- realtime service; here the API server holds one LISTEN connection and
-- fans out to browsers over SSE (server/src/routes/events.js).
CREATE OR REPLACE FUNCTION public.notify_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_row     RECORD := COALESCE(NEW, OLD);
  v_payload JSONB;
BEGIN
  v_payload := jsonb_build_object(
    'table',       TG_TABLE_NAME,
    'op',          TG_OP,
    'id',          v_row.id,
    'pharmacy_id', CASE WHEN to_jsonb(v_row) ? 'pharmacy_id' THEN to_jsonb(v_row)->>'pharmacy_id' END,
    'user_id',     CASE WHEN to_jsonb(v_row) ? 'user_id'     THEN to_jsonb(v_row)->>'user_id'     END
  );
  -- pg_notify caps the payload at 8000 bytes, so this carries identifiers
  -- only and the client refetches. That also avoids leaking row contents
  -- to a listener that is not authorized to read them.
  PERFORM pg_notify('pharmconnect_changes', v_payload::text);
  RETURN NULL;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'notifications', 'drug_requests', 'drug_reservations',
    'pending_approvals', 'pharmacy_stock', 'delete_requests'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_notify ON public.%1$I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_notify AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
       FOR EACH ROW EXECUTE FUNCTION public.notify_change()', t);
  END LOOP;
END $$;

COMMIT;
