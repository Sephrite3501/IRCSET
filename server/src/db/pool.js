import pg from 'pg';
const { Pool } = pg;


export const appDb = new Pool({ connectionString: process.env.DATABASE_URL });


export const memberDb = process.env.IRC_MEMBERSHIP_CHECK_URL
? new Pool({ connectionString: process.env.IRC_MEMBERSHIP_CHECK_URL })
: null;