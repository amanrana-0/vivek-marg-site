// Shared Postgres connection pool, reused across warm serverless
// invocations (a fresh Pool per request would exhaust connections fast).
const { Pool } = require("pg");

let pool;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL is not set. Add it in Netlify: Site settings -> " +
        "Environment variables -> DATABASE_URL."
      );
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Most hosted Postgres (Supabase, Render, RDS, etc.) needs SSL but
      // presents a cert that Node's default strict verification will
      // reject unless you also configure CA certs. This is the same
      // relaxed-but-still-encrypted setting already used by the RP
      // dashboard API for the same database.
      ssl: { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pool;
}

module.exports = { getPool };
