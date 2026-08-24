// PUT /api/progress  (Authorization: Bearer <token>)  { progress: {...} }
//
// Shallow-merges the given object into the user's stored progress, e.g.
// calling with { progress: { readIntro: true } } sets just that key
// without wiping out other progress already saved. This keeps the
// front-end free to track whatever it wants (resources read, quiz
// scores, chat history refs, etc.) without further schema changes.
const { getPool } = require("./_lib/db");
const { CORS, json, requireAuth } = require("./_lib/auth");

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "PUT" && event.httpMethod !== "POST") {
    return json(405, { error: "Use PUT." });
  }

  let decoded;
  try {
    decoded = requireAuth(event);
  } catch {
    return json(401, { error: "Not signed in." });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const patch = body.progress;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return json(400, { error: "Body must be { progress: { ... } }." });
  }

  try {
    const pool = getPool();
    const result = await pool.query(
      `update public.vivekmarg_users
       set progress = coalesce(progress, '{}'::jsonb) || $1::jsonb
       where id = $2
       returning progress`,
      [JSON.stringify(patch), decoded.sub]
    );
    if (result.rows.length === 0) return json(401, { error: "Account no longer exists." });
    return json(200, { progress: result.rows[0].progress });
  } catch (e) {
    console.error("progress error:", e);
    return json(500, { error: "Something went wrong saving your progress." });
  }
};
