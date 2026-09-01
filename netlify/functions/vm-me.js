// GET /api/me   (Authorization: Bearer <token>)
// Lets the front-end re-fetch the current user + progress on page load
// without asking them to log in again.
const { getPool } = require("./_lib/db");
const { CORS, json, requireAuth } = require("./_lib/auth");

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "GET") return json(405, { error: "Use GET." });

  let decoded;
  try {
    decoded = requireAuth(event);
  } catch {
    return json(401, { error: "Not signed in." });
  }

  try {
    const pool = getPool();
    const result = await pool.query(
      `select id, name, email, phone, role, college, year_of_study, motivation, consent, progress
       from public.vivekmarg_users where id = $1`,
      [decoded.sub]
    );
    if (result.rows.length === 0) return json(401, { error: "Account no longer exists." });
    return json(200, { user: result.rows[0] });
  } catch (e) {
    console.error("me error:", e);
    return json(500, { error: "Something went wrong loading your account." });
  }
};
