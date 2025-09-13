// server/src/services/membershipCheck.js
import pg from 'pg';

let roPool = null;

function getPool() {
  const url = process.env.IRC_MEMBERSHIP_CHECK_URL;
  if (!url) return null;
  if (!roPool) {
    roPool = new pg.Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10_000 });
    roPool.on('error', (e) => console.error('[IRC-RO] pool error', e.message));
  }
  return roPool;
}

/**
 * Check IRC membership by email (case-insensitive).
 * Policy (you can tune this):
 *  ok = (account_status in ['active','approved']) AND (is_paid = true)
 */
export async function checkMembershipByEmail(email) {
  if (!email) return { ok: false, reason: 'invalid_email' };

  const pool = getPool();
  if (!pool) return { ok: false, reason: 'unconfigured' };

  try {
    const e = String(email).trim().toLowerCase();
    const { rows } = await pool.query(
      `SELECT email, account_status, is_paid, approved_at
         FROM public.member_status_v
        WHERE email = $1
        LIMIT 1`,
      [e]
    );

    if (!rows.length) {
      return { ok: false, reason: 'invalid no data found', meta: { found: false } };
    }

    const r = rows[0];
    const statusOk = ['active', 'approved'].includes((r.account_status || '').toLowerCase());
    const paidOk = !!r.is_paid;

    const ok = statusOk && paidOk;

    return {
      ok,
      reason: ok ? undefined : 'invalid',
      meta: {
        account_status: r.account_status,
        is_paid: !!r.is_paid,
        approved_at: r.approved_at || null
      }
    };
  } catch (err) {
    console.error('[IRC-RO] query error:', err.message);
    return { ok: false, reason: 'error', error: err.message };
  }
}
