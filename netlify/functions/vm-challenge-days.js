// GET /api/challenge-days
// Public (no login required) — the 21 days' content is the same for
// everyone. Returned once and can be cached client-side for the
// session, since it essentially never changes.
const { getPool } = require("./_lib/db");
const { CORS, json } = require("./_lib/auth");

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "GET") return json(405, { error: "Use GET." });

  try {
    const pool = getPool();
    const result = await pool.query(
      `select day_number, title, challenge_text, reflection_prompt
       from public.challenge_days
       order by day_number`
    );
    return json(200, { days: result.rows });
  } catch (e) {
    console.error("challenge-days error:", e);
    return json(500, { error: "Could not load challenge content." });
  }
};
