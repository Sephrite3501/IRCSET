-- ======== CLEAN BOOTSTRAP (REPLACE WHOLE SCHEMA) ========
CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

DROP TABLE IF EXISTS session_tokens, audit_logs, membership_validations, decisions,
  reviews, assignments, submissions, event_roles, events, users CASCADE;

-- Users
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX users_email_lower_unique ON users (LOWER(email));

-- Events
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

-- Submissions
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

-- Audit logs
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  trace_id TEXT,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','error')),
  details_json JSONB NOT NULL DEFAULT '{}',
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Session tokens
CREATE TABLE session_tokens (
  id SERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip TEXT,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
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

-- Trigger: auto-touch submissions.updated_at
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

-- Seed admin (password = StrongP@ssw0rd!)
INSERT INTO users (email, password_hash, name, is_admin)
VALUES ('admin1@example.com', crypt('StrongP@ssw0rd!', gen_salt('bf', 10)), 'Admin One', true);

COMMIT;
