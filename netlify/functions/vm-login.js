// POST /api/login  { email, password }
const bcrypt = require("bcryptjs");
const { getPool } = require("./_lib/db");
const { CORS, json, signToken } = require("./_lib/auth");

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) return json(400, { error: "Email and password are required." });

  try {
    const pool = getPool();
    const result = await pool.query(
      `select id, name, email, password_hash, phone, college, year_of_study, motivation, consent, progress
       from public.vivekmarg_users
       where lower(email) = $1`,
      [email]
    );

    // Deliberately generic message whether the email doesn't exist or
    // the password is wrong — don't reveal which, to avoid leaking
    // which emails have accounts.
    const invalid = () => json(401, { error: "Invalid email or password." });

    if (result.rows.length === 0) return invalid();

    const row = result.rows[0];
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return invalid();

    const { password_hash, ...user } = row;
    const token = signToken(user);
    return json(200, { token, user });
  } catch (e) {
    console.error("login error:", e);
    return json(500, { error: "Something went wrong signing you in. Please try again." });
  }
};
