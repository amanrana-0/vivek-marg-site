// POST /api/signup  { name, email, password, phone, college, year, motivation, consent }
// Creates a row in public.vivekmarg_users. Never touches public.users
// (the internal staff/RP table) in any way.
//
// This doubles as the Vivek Marg course registration: the same submit
// that creates a login also records their registration details, since
// the front-end's "Sign Up" tab is the existing registration form.
const bcrypt = require("bcryptjs");
const { getPool } = require("./_lib/db");
const { CORS, json, signToken } = require("./_lib/auth");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-\s]{7,15}$/;

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const phone = String(body.phone || "").trim();
  const college = String(body.college || "").trim();
  const year = String(body.year || "").trim();
  const motivation = body.motivation ? String(body.motivation).trim() : null;
  const consent = body.consent === true;

  if (!name) return json(400, { error: "Please enter your name." });
  if (!EMAIL_RE.test(email)) return json(400, { error: "Please enter a valid email address." });
  if (password.length < 8) return json(400, { error: "Password must be at least 8 characters." });
  if (!PHONE_RE.test(phone)) return json(400, { error: "Please enter a valid phone number." });
  if (!college) return json(400, { error: "Please enter your college or university." });
  if (!year) return json(400, { error: "Please select your year of study." });
  if (!consent) return json(400, { error: "Please accept to continue." });

  try {
    const password_hash = await bcrypt.hash(password, 10);
    const pool = getPool();
    const result = await pool.query(
      `insert into public.vivekmarg_users
         (name, email, password_hash, phone, college, year_of_study, motivation, consent)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id, name, email, phone, college, year_of_study, motivation, consent, progress, created_at`,
      [name, email, password_hash, phone, college, year, motivation, consent]
    );
    const user = result.rows[0];
    const token = signToken(user);
    return json(201, { token, user });
  } catch (e) {
    if (e.code === "23505") {
      // unique_violation on the lower(email) index
      return json(409, { error: "An account with that email already exists." });
    }
    console.error("signup error:", e);
    return json(500, { error: "Something went wrong creating your account. Please try again." });
  }
};
