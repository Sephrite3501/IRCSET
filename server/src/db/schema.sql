-- ======== CLEAN BOOTSTRAP (REPLACE WHOLE SCHEMA) ========
CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

-- Drop in dependency-friendly order (CASCADE ensures all refs go)
DROP TABLE IF EXISTS
  session_tokens,
  audit_logs,
  membership_validations,
  decisions,
  reviews,
  assignments,
  submissions,
  event_roles,
  events,
  users
CASCADE;

-- ===================== USERS =====================
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  account_status TEXT NOT NULL DEFAULT 'active',
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX users_email_lower_unique ON users (LOWER(email));

-- ===================== AUTH SUPPORT TABLES =====================
-- Attempts table used by login throttling
CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_created
  ON login_attempts(email, created_at DESC);

-- OTP store used by 2-step login (email-based)
CREATE TABLE IF NOT EXISTS login_otp (
  email TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);

-- Activation tokens for email verification
CREATE TABLE IF NOT EXISTS activation_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activation_tokens_token ON activation_tokens(token);
CREATE INDEX IF NOT EXISTS idx_activation_tokens_user_id ON activation_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_activation_tokens_expires ON activation_tokens(expires_at);

-- ===================== EVENTS =====================
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE,
  end_date DATE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Event roles
CREATE TABLE event_roles (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('author','reviewer','chair')),
  UNIQUE(event_id, user_id, role)
);

-- ===================== SUBMISSIONS =====================
CREATE TABLE submissions (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  author_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  abstract TEXT,
  keywords TEXT,
  pdf_path TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('submitted','under_review','decision_made','final_required','final_submitted')
  ),
  irc_member_email_optional TEXT,
  final_pdf_path TEXT,
  final_submitted_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT submissions_final_guard
    CHECK (
      status <> 'final_submitted'
      OR (final_pdf_path IS NOT NULL AND final_submitted_at IS NOT NULL)
    )
);

-- Assignments
CREATE TABLE assignments (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  reviewer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_at TIMESTAMP,
  assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT assignments_unique UNIQUE (submission_id, reviewer_user_id)
);

-- Reviews (ITP style: four subscores 1..5, overall 1..5; two comment targets)
CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  reviewer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- subscores 1..5
  score_technical   SMALLINT CHECK (score_technical  BETWEEN 1 AND 5),
  score_relevance   SMALLINT CHECK (score_relevance  BETWEEN 1 AND 5),
  score_innovation  SMALLINT CHECK (score_innovation BETWEEN 1 AND 5),
  score_writing     SMALLINT CHECK (score_writing    BETWEEN 1 AND 5),

  -- overall kept for convenience (server computes avg of 4), 1..5
  score_overall NUMERIC(4,2) CHECK (score_overall >= 1 AND score_overall <= 5),

  comments_for_author   TEXT,
  comments_committee    TEXT,     -- (renamed from comments_confidential)

  status TEXT NOT NULL CHECK (status IN ('assigned','in_progress','submitted')),
  submitted_at TIMESTAMP,

  CONSTRAINT reviews_unique UNIQUE (submission_id, reviewer_user_id),
  CONSTRAINT reviews_submitted_guard
    CHECK (status <> 'submitted' OR submitted_at IS NOT NULL),

  -- when submitted, all four subscores and overall must be present
  CONSTRAINT reviews_scores_present_when_submitted CHECK (
    status <> 'submitted' OR (
      score_technical IS NOT NULL
      AND score_relevance IS NOT NULL
      AND score_innovation IS NOT NULL
      AND score_writing IS NOT NULL
      AND score_overall IS NOT NULL
    )
  )
);

-- Decisions
CREATE TABLE decisions (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  decider_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('accept','reject')),
  reason TEXT,
  decided_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (submission_id)
);

-- Membership validation audit
CREATE TABLE membership_validations (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  checked_email TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('valid','invalid','unconfigured','error')),
  paid_until DATE,
  checked_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ===================== AUDIT LOGS =====================
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  trace_id TEXT,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','error')),
  details JSONB NOT NULL DEFAULT '{}',         -- matches code (details)
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ===================== SESSIONS =====================
CREATE TABLE session_tokens (
  id SERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip TEXT,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===================== (OPTIONAL) OTHER 2FA TABLES =====================
-- Keep these if other features use them; they don't conflict with login_otp/attempts
CREATE TABLE IF NOT EXISTS otp_codes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  code VARCHAR(10) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS otp_attempts (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  attempt_time TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otp_attempt_window
  ON otp_attempts (email, ip_address, attempt_time);

-- ===================== INDEXES =====================
CREATE INDEX idx_submissions_author        ON submissions (author_user_id);
CREATE INDEX idx_submissions_event         ON submissions (event_id);
CREATE INDEX idx_submissions_status        ON submissions (status);
CREATE INDEX idx_assignments_submission    ON assignments (submission_id);
CREATE INDEX idx_reviews_submission        ON reviews (submission_id);
CREATE INDEX idx_reviews_sub_status        ON reviews (submission_id, status);
CREATE INDEX idx_decisions_submission      ON decisions (submission_id);
CREATE INDEX idx_mv_submission             ON membership_validations (submission_id);
CREATE INDEX idx_audit_entity              ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_session_tokens_user_exp   ON session_tokens (user_id, expires_at);
CREATE INDEX idx_reviews_submitted_only    ON reviews (submission_id) WHERE status='submitted';

-- ===================== TRIGGERS =====================
-- Auto-touch submissions.updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_submissions_updated_at ON submissions;
CREATE TRIGGER trg_submissions_updated_at
BEFORE UPDATE ON submissions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===================== SEED =====================
-- Seed admin (password = StrongP@ssw0rd!) - requires pgcrypto for crypt/gen_salt
INSERT INTO users (email, password_hash, name, is_admin)
VALUES ('admin1@example.com', crypt('StrongP@ssw0rd!', gen_salt('bf', 10)), 'Admin One', true);


-- ====================ALTERS====================

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS score_technical     INTEGER CHECK (score_technical BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS score_relevance     INTEGER CHECK (score_relevance BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS score_innovation    INTEGER CHECK (score_innovation BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS score_writing       INTEGER CHECK (score_writing BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS score_overall       NUMERIC(4,2) CHECK (score_overall BETWEEN 0 AND 5),
  ADD COLUMN IF NOT EXISTS comments_committee  TEXT,
  ADD COLUMN IF NOT EXISTS review_submitted    BOOLEAN DEFAULT FALSE;

-- ==================== EXTERNAL REVIEWERS FEATURE ====================
CREATE TABLE external_reviewers (
  id SERIAL PRIMARY KEY,
  event_id INT REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  invite_token TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'invited' CHECK (status IN ('invited', 'submitted')),
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);

ALTER TABLE assignments
  ADD COLUMN external_reviewer_id INT REFERENCES external_reviewers(id); 

ALTER TABLE assignments ADD COLUMN event_id INT REFERENCES events(id) ON DELETE CASCADE;

ALTER TABLE assignments ALTER COLUMN reviewer_user_id DROP NOT NULL;

ALTER TABLE reviews
ADD COLUMN external_reviewer_id INT REFERENCES external_reviewers(id) ON DELETE CASCADE;

ALTER TABLE reviews
ADD CONSTRAINT unique_external_review UNIQUE (submission_id, external_reviewer_id);

ALTER TABLE reviews ALTER COLUMN reviewer_user_id DROP NOT NULL;

ALTER TABLE reviews
ADD CONSTRAINT reviewer_xor_external_check
CHECK (
  (reviewer_user_id IS NOT NULL AND external_reviewer_id IS NULL)
  OR (reviewer_user_id IS NULL AND external_reviewer_id IS NOT NULL)
);


ALTER TABLE submissions
ADD CONSTRAINT submissions_status_check
CHECK (status IN ('approved', 'rejected'));

COMMIT;
