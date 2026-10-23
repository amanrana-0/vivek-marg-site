// GET /api/certificates   (Authorization: Bearer <token>)
// Returns the certificates issued to the signed-in visitor: every active
// row in vivekmarg_certificates whose email matches their account email
// (case-insensitive, spaces ignored). Empty list = no certificate, and
// the front-end shows nothing.
//
// The email is read from vivekmarg_users using the id in the verified
// token, never from the request, so nobody can fetch another person's
// certificate by sending a different email.
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
    const userRes = await pool.query(
      `select name, email from public.vivekmarg_users where id = $1`,
      [decoded.sub]
    );
    if (userRes.rows.length === 0) return json(401, { error: "Account no longer exists." });
    const user = userRes.rows[0];

    const { rows } = await pool.query(
      `select id,
              coalesce(nullif(trim(recipient_name), ''), $2) as recipient_name,
              certificate_title, description,
              to_char(issue_date, 'YYYY-MM-DD') as issue_date,
              signatory, signatory_caption
       from public.vivekmarg_certificates
       where lower(trim(email)) = lower(trim($1)) and is_active = true
       order by issue_date desc, id desc`,
      [user.email, user.name]
    );
    return json(200, { certificates: rows });
  } catch (e) {
    console.error("vm-certificates error:", e);
    return json(500, { error: "Something went wrong loading your certificates." });
  }
};
