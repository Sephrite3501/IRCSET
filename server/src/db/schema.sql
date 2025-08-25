-- =========================
-- Core tables
-- =========================

-- Users & roles
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL CHECK (role IN ('author','reviewer','chair','decision_maker','admin')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Categories (A–E)
CREATE TABLE categories (
  id TEXT PRIMARY KEY,        -- 'A' | 'B' | 'C' | 'D' | 'E'
  label TEXT NOT NULL DEFAULT ''
);

INSERT INTO categories (id, label) VALUES
  ('A','A'),('B','B'),('C','C'),('D','D'),('E','E')
ON CONFLICT DO NOTHING;

-- Per-category role scoping
CREATE TABLE user_categories (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  role_scope TEXT NOT NULL CHECK (role_scope IN ('reviewer','decision_maker')),
  PRIMARY KEY (user_id, category_id, role_scope)
);

-- Submissions
CREATE TABLE submissions (
  id SERIAL PRIMARY KEY,
  author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
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
  -- Safety: when final_submitted, require path & timestamp
  CONSTRAINT submissions_final_guard
    CHECK (
      status <> 'final_submitted'
      OR (final_pdf_path IS NOT NULL AND final_submitted_at IS NOT NULL)
    )
);

-- Assignments (chair -> reviewers)
CREATE TABLE assignments (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  reviewer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_at TIMESTAMP,
  assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  -- Prevent duplicate assignment of the same reviewer to the same submission
  CONSTRAINT assignments_unique UNIQUE (submission_id, reviewer_user_id)
);

-- Reviews (double-blind)
CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  reviewer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score_overall NUMERIC(4,2) CHECK (score_overall >= 0 AND score_overall <= 10),
  comments_for_author TEXT,
  comments_confidential TEXT,
  status TEXT NOT NULL CHECK (status IN ('assigned','in_progress','submitted')),
  submitted_at TIMESTAMP,
  -- Single review row per (submission, reviewer)
  CONSTRAINT reviews_unique UNIQUE (submission_id, reviewer_user_id),
  -- If marked submitted, require submitted_at
  CONSTRAINT reviews_submitted_guard
    CHECK (status <> 'submitted' OR submitted_at IS NOT NULL)
);

-- Decisions (one per submission)
CREATE TABLE decisions (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
  decider_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  decision TEXT NOT NULL CHECK (decision IN ('accepted','rejected')),
  reason TEXT,
  decided_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Membership validation audit (final-stage)
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
  severity TEXT NOT NULL DEFAULT 'info',
  details_json JSONB NOT NULL DEFAULT '{}',
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Session token store (cookie-based login)
CREATE TABLE session_tokens (
  id SERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20),
  ip TEXT,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================
-- Helpful indexes
-- =========================

-- Submissions
CREATE INDEX idx_submissions_author        ON submissions (author_user_id);
CREATE INDEX idx_submissions_category      ON submissions (category_id);
CREATE INDEX idx_submissions_status        ON submissions (status);
CREATE INDEX idx_submissions_cat_status    ON submissions (category_id, status);

-- Assignments / Reviews
CREATE INDEX idx_assignments_submission    ON assignments (submission_id);
CREATE INDEX idx_reviews_submission        ON reviews (submission_id);
CREATE INDEX idx_reviews_sub_status        ON reviews (submission_id, status);

-- User scoping & decisions
CREATE INDEX idx_user_categories_user_scope ON user_categories (user_id, role_scope);
CREATE INDEX idx_decisions_submission       ON decisions (submission_id);

-- Membership + audit
CREATE INDEX idx_mv_submission              ON membership_validations (submission_id);
CREATE INDEX idx_audit_entity               ON audit_logs (entity_type, entity_id);

-- Sessions (cleanup & lookups)
CREATE INDEX idx_session_tokens_user_exp    ON session_tokens (user_id, expires_at);

-- =========================
-- Trigger: auto-touch submissions.updated_at
-- =========================
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

COMMIT;
