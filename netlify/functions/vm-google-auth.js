// POST /api/google-auth
//
// Step 1 — { credential }
//   `credential` is the ID token from the "Continue with Google" button.
//   - Existing account (matched by Google ID, or by the same email) ->
//     signs them in: { token, user }. An email/password account with the
//     same email gets linked to Google, so it keeps its progress.
//   - New person -> { needsProfile: true, pendingToken, profile:{name,email} }
//     The front-end then shows the registration form (phone, role,
//     college...) with the email locked, and no password field.
//
// Step 2 — { pendingToken, name, phone, role, college, year, motivation, consent }
//   Creates the account with no password (password_hash is NULL) and
//   google_sub set, then signs them in: { token, user }.
//
// Like the other vm-* functions, this only touches public.vivekmarg_users.
const { getPool } = require("./_lib/db");
const { CORS, json, signToken, signGooglePending, verifyGooglePending } = require("./_lib/auth");
const { verifyGoogleIdToken } = require("./_lib/google");

const PHONE_RE = /^[0-9+\-\s]{7,15}$/;
const ROLES = ["student", "professor", "institution"];
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

  if (body.pendingToken) return completeSignup(body);
  if (body.credential) return signInWithGoogle(body.credential);
  return json(400, { error: "Missing Google credential." });
};

async function signInWithGoogle(credential) {
  let g;
  try {
    g = await verifyGoogleIdToken(String(credential));
  } catch (e) {
    console.error("google verify error:", e.message);
    return json(401, { error: "Google sign-in could not be verified. Please try again." });
  }

  try {
    const pool = getPool();

    // 1) Already linked to this Google account?
    let result = await pool.query(
      `select ${USER_COLS}, google_sub from public.vivekmarg_users where google_sub = $1`,
      [g.sub]
    );

    // 2) Otherwise, an account with the same email (e.g. signed up with a password earlier)?
    if (result.rows.length === 0) {
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
      }
    }

    if (result.rows.length) {
      const { google_sub, ...user } = result.rows[0];
      return json(200, { token: signToken(user), user });
    }

    // 3) New person: ask for the registration details first.
    return json(200, {
      needsProfile: true,
      pendingToken: signGooglePending(g),
      profile: { name: g.name, email: g.email },
    });
  } catch (e) {
    console.error("google sign-in error:", e);
    return json(500, { error: "Something went wrong signing you in. Please try again." });
  }
}

async function completeSignup(body) {
  let g;
  try {
    g = verifyGooglePending(body.pendingToken);
  } catch {
    return json(401, { error: "Your Google sign-in has expired. Please click \"Continue with Google\" again." });
  }

  const name = String(body.name || g.name || "").trim();
  const phone = String(body.phone || "").trim();
  const role = String(body.role || "").trim();
  const college = String(body.college || "").trim();
  const year = String(body.year || "").trim();
  const motivation = body.motivation ? String(body.motivation).trim() : null;
  const consent = body.consent === true;

  if (!name) return json(400, { error: "Please enter your name." });
  if (!PHONE_RE.test(phone)) return json(400, { error: "Please enter a valid phone number." });
  if (!ROLES.includes(role)) return json(400, { error: "Please select whether you're a student, professor, or college/university." });
  if (!college) return json(400, { error: "Please enter your college or university." });
  if (role === "student" && !year) return json(400, { error: "Select your year of study." });
  if (!consent) return json(400, { error: "Please accept to continue." });

  try {
    const pool = getPool();
    const result = await pool.query(
      `insert into public.vivekmarg_users
         (name, email, password_hash, google_sub, phone, role, college, year_of_study, motivation, consent)
       values ($1, $2, null, $3, $4, $5, $6, $7, $8, $9)
       returning ${USER_COLS}`,
      [name, g.email, g.sub, phone, role, college, role === "student" ? year : null, motivation, consent]
    );
    const user = result.rows[0];
    return json(201, { token: signToken(user), user });
  } catch (e) {
    if (e.code === "23505") {
      // Email or Google account already registered (e.g. a double-click).
      return json(409, { error: "An account with this email already exists. Click \"Continue with Google\" on the Sign In tab." });
    }
    console.error("google signup error:", e);
    return json(500, { error: "Something went wrong creating your account. Please try again." });
  }
}
