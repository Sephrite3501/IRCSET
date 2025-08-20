-- Users & roles
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL CHECK (role IN ('author','reviewer','chair','decision_maker','admin')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Categories (A–E placeholders)
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,        -- 'A' | 'B' | 'C' | 'D' | 'E'
  label TEXT NOT NULL DEFAULT ''
);

INSERT INTO categories (id, label) VALUES
  ('A','A'),('B','B'),('C','C'),('D','D'),('E','E')
ON CONFLICT DO NOTHING;

-- Per-category role scoping
CREATE TABLE IF NOT EXISTS user_categories (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
  role_scope TEXT NOT NULL CHECK (role_scope IN ('reviewer','decision_maker')),
  PRIMARY KEY (user_id, category_id, role_scope)
);

-- Submissions
CREATE TABLE IF NOT EXISTS submissions (
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
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Assignments (chair -> reviewers)
CREATE TABLE IF NOT EXISTS assignments (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER REFERENCES submissions(id) ON DELETE CASCADE,
  reviewer_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  assigned_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_at TIMESTAMP,
  assigned_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Reviews (double-blind)
CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER REFERENCES submissions(id) ON DELETE CASCADE,
  reviewer_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  score_overall NUMERIC(4,2) CHECK (score_overall >= 0 AND score_overall <= 10),
  comments_for_author TEXT,
  comments_confidential TEXT,
  status TEXT NOT NULL CHECK (status IN ('assigned','in_progress','submitted')),
  submitted_at TIMESTAMP
);

-- Decisions (one per submission)
CREATE TABLE IF NOT EXISTS decisions (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
  decider_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  decision TEXT NOT NULL CHECK (decision IN ('accepted','rejected')),
  reason TEXT,
  decided_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Membership validation audit (final-stage)
CREATE TABLE IF NOT EXISTS membership_validations (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER REFERENCES submissions(id) ON DELETE CASCADE,
  checked_email TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('valid','invalid','unconfigured','error')),
  paid_until DATE,
  checked_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
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
