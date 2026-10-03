// POST /api/google-auth   { credential }
//
// `credential` is the ID token from the "Continue with Google" button.
// Google only shares name, email and a Google account ID, and that is all
// we store for Google users -- no extra form, they are signed in at once.
//   - Already linked to this Google account -> sign in.
//   - Same email as an existing account (e.g. signed up with a password
//     earlier) -> link the Google account to it and sign in; progress kept.
//   - New person -> create the account (no password, no phone/college/role)
//     and sign in.
// Responds { token, user } in every success case.
//
// Like the other vm-* functions, this only touches public.vivekmarg_users.
const { getPool } = require("./_lib/db");
const { CORS, json, signToken } = require("./_lib/auth");
const { verifyGoogleIdToken } = require("./_lib/google");

const USER_COLS =
  "id, name, email, phone, role, college, year_of_study, motivation, consent, progress";

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST." });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }
  if (!body.credential) return json(400, { error: "Missing Google credential." });

  let g;
  try {
    g = await verifyGoogleIdToken(String(body.credential));
  } catch (e) {
    console.error("google verify error:", e.message);
    return json(401, { error: "Google sign-in could not be verified. Please try again." });
  }

  try {
    const pool = getPool();
    const signIn = (row) => {
      const { google_sub, ...user } = row;
      return json(200, { token: signToken(user), user });
    };

    // 1) Already linked to this Google account?
    let result = await pool.query(
      `select ${USER_COLS}, google_sub from public.vivekmarg_users where google_sub = $1`,
      [g.sub]
    );
    if (result.rows.length) return signIn(result.rows[0]);

    // 2) An account with the same email?
    result = await pool.query(
      `select ${USER_COLS}, google_sub from public.vivekmarg_users where lower(email) = $1`,
      [g.email]
    );
    if (result.rows.length) {
      const row = result.rows[0];
      if (row.google_sub && row.google_sub !== g.sub) {
        return json(409, {
          error: "This email is linked to a different Google account. Please sign in with your email and password instead.",
        });
      }
      // Google has verified they own this email, so it's safe to link.
      await pool.query(
        `update public.vivekmarg_users set google_sub = $1, updated_at = now() where id = $2`,
        [g.sub, row.id]
      );
      return signIn(row);
    }

    // 3) New person: create the account from what Google provides.
    // name is required (and the site shows its first letter), so fall back
    // to the part of the email before "@" if Google didn't send a name.
    const name = g.name || g.email.split("@")[0];
    try {
      result = await pool.query(
        `insert into public.vivekmarg_users (name, email, password_hash, google_sub, consent)
         values ($1, $2, null, $3, false)
         returning ${USER_COLS}`,
        [name, g.email, g.sub]
      );
      return json(201, { token: signToken(result.rows[0]), user: result.rows[0] });
    } catch (e) {
      if (e.code !== "23505") throw e;
      // Created a moment ago (e.g. a double click) -- just sign them in.
      result = await pool.query(
        `select ${USER_COLS}, google_sub from public.vivekmarg_users where google_sub = $1`,
        [g.sub]
      );
      if (result.rows.length) return signIn(result.rows[0]);
      throw e;
    }
  } catch (e) {
    console.error("google sign-in error:", e);
    return json(500, { error: "Something went wrong signing you in. Please try again." });
  }
}
