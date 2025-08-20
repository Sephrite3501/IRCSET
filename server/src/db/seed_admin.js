// server/src/db/seed_admin.js
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { appDb } from './pool.js';

dotenv.config({ path: new URL('../../.env', import.meta.url).pathname });

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  const name = process.argv[4] || 'Admin';

  if (!email || !password) {
    console.log('Usage: node src/db/seed_admin.js admin@example.com StrongPass123');
    process.exit(1);
  }

  const exists = await appDb.query('SELECT 1 FROM users WHERE LOWER(email)=$1', [email.toLowerCase()]);
  if (exists.rowCount) {
    console.log('Admin already exists.');
    process.exit(0);
  }

  const hash = await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS || 10));
  const ins = await appDb.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1,$2,$3,'admin') RETURNING id, email, role`,
    [email.toLowerCase(), hash, name]
  );
  console.log('Created admin:', ins.rows[0]);
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
