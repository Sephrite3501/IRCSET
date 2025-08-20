# IRCSET API (Backend-first)


## Prereqs
- Docker & Docker Compose
- Create external docker network once: `docker network create irc-shared-net`
- If you will enable membership checks now: ensure the IRC DB is reachable and has a read-only view `public.member_status_v` + user.


## Setup
1. Copy `server/.env.example` to `server/.env` and fill values.
2. `docker compose up --build`
3. Visit `http://localhost:3005/healthz` → `{ ok: true }`.


## IRC membership (final submission gate)
In the **IRC DB**, provision:
```sql
CREATE OR REPLACE VIEW public.member_status_v AS
SELECT id AS irc_user_id, LOWER(email) AS email, account_status, COALESCE(is_paid,false) AS is_paid, paid_until
FROM users;


CREATE USER irc_ro_check WITH PASSWORD 'REPLACE';
GRANT CONNECT ON DATABASE irc_db TO irc_ro_check;
GRANT USAGE ON SCHEMA public TO irc_ro_check;
GRANT SELECT ON public.member_status_v TO irc_ro_check;