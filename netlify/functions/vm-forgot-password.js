// POST /api/forgot-password  { email }
//
// If the email belongs to a vivekmarg_users account, generates a 6-digit
// OTP, stores it with a 10-minute expiry, and emails it via Resend
// (using the verified rkmviva.org domain). Always returns the same
// generic success message regardless of whether the email exists, so
// this endpoint can't be used to check which emails are registered.
const crypto = require("crypto");
const { getPool } = require("./_lib/db");
const { CORS, json } = require("./_lib/auth");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_MESSAGE = "If that email is registered, we've sent a 6-digit code to it.";

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
  if (!EMAIL_RE.test(email)) return json(400, { error: "Please enter a valid email address." });

  try {
    const pool = getPool();
    const result = await pool.query(
      `select id, name, email, otp_expires_at from public.vivekmarg_users where lower(email) = $1`,
      [email]
    );

    // Always behave the same whether or not the account exists.
    if (result.rows.length === 0) {
      return json(200, { message: GENERIC_MESSAGE });
    }

    const user = result.rows[0];

    // Cooldown: a code is always set to expire 10 minutes from now when
    // sent. If more than 9 of those 10 minutes are still remaining, a
    // code was sent less than a minute ago -- block re-sending so this
    // endpoint can't be used to spam someone's inbox.
    if (user.otp_expires_at) {
      const msRemaining = new Date(user.otp_expires_at).getTime() - Date.now();
      if (msRemaining > 9 * 60 * 1000) {
        return json(200, { message: GENERIC_MESSAGE });
      }
    }

    const otp = String(crypto.randomInt(0, 1000000)).padStart(6, "0");

    await pool.query(
      `update public.vivekmarg_users
         set otp_code = $1, otp_expires_at = now() + interval '10 minutes', otp_attempts = 0
       where id = $2`,
      [otp, user.id]
    );

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY is not set.");
      // Don't leak configuration issues to the client -- still return
      // the generic message, but log server-side so it can be fixed.
      return json(200, { message: GENERIC_MESSAGE });
    }

    const firstName = (user.name || "there").split(" ")[0];
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify({
        from: "Vivek Marg <vivekmarg@rkmviva.org>",
        to: user.email,
        subject: "Your Vivek Marg password reset code",
        html:
          `<p>Hi ${firstName},</p>` +
          `<p>Your password reset code is:</p>` +
          `<p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${otp}</p>` +
          `<p>This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>` +
          `<p>&mdash; Vivek Marg</p>`,
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text().catch(() => "");
      console.error("Resend send failed:", emailRes.status, errText);
    }

    return json(200, { message: GENERIC_MESSAGE });
  } catch (e) {
    console.error("forgot-password error:", e);
    // Still generic, even on unexpected errors -- don't leak internals.
    return json(200, { message: GENERIC_MESSAGE });
  }
};
