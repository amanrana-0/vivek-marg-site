// POST /api/reset-password  { email, otp, newPassword }
//
// Verifies the 6-digit OTP (must match and not be expired), then sets
// the new password and clears the OTP so it can't be reused.
const bcrypt = require("bcryptjs");
const { getPool } = require("./_lib/db");
const { CORS, json } = require("./_lib/auth");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_RE = /^[0-9]{6}$/;

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
  const otp = String(body.otp || "").trim();
  const newPassword = String(body.newPassword || "");

  if (!EMAIL_RE.test(email)) return json(400, { error: "Please enter a valid email address." });
  if (!OTP_RE.test(otp)) return json(400, { error: "Enter the 6-digit code from your email." });
  if (newPassword.length < 8) return json(400, { error: "Password must be at least 8 characters." });

  try {
    const pool = getPool();
    const result = await pool.query(
      `select id, otp_code, otp_expires_at, otp_attempts from public.vivekmarg_users where lower(email) = $1`,
      [email]
    );

    // Same generic error whether the email doesn't exist, the code is
    // wrong, or the code expired -- don't help an attacker narrow it down.
    const invalid = () => json(400, { error: "That code is invalid or has expired. Request a new one." });

    if (result.rows.length === 0) return invalid();
    const row = result.rows[0];
    if (!row.otp_code) return invalid();
    if (!row.otp_expires_at || new Date(row.otp_expires_at).getTime() < Date.now()) return invalid();

    // Cap wrong guesses at 5 -- a correct code still succeeds no matter
    // how many prior wrong guesses there were (as long as it hasn't hit
    // the cap yet); only a WRONG guess that would push attempts to 5
    // wipes the code, so a lucky correct final try is never blocked.
    if (row.otp_code !== otp) {
      const nextAttempts = row.otp_attempts + 1;
      if (nextAttempts >= 5) {
        await pool.query(
          `update public.vivekmarg_users set otp_code = null, otp_expires_at = null, otp_attempts = 0 where id = $1`,
          [row.id]
        );
        return json(400, { error: "Too many incorrect attempts. Request a new code." });
      }
      await pool.query(
        `update public.vivekmarg_users set otp_attempts = $1 where id = $2`,
        [nextAttempts, row.id]
      );
      return invalid();
    }

    const password_hash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      `update public.vivekmarg_users
         set password_hash = $1, otp_code = null, otp_expires_at = null, otp_attempts = 0
       where id = $2`,
      [password_hash, row.id]
    );

    return json(200, { message: "Your password has been reset. You can now sign in." });
  } catch (e) {
    console.error("reset-password error:", e);
    return json(500, { error: "Something went wrong. Please try again." });
  }
};
