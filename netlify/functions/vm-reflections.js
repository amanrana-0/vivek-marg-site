// GET    /api/reflections            -> list all of MY reflections
// POST   /api/reflections { day_number, reflection_text } -> add one
// DELETE /api/reflections?id=<uuid>  -> remove one of MY reflections
//
// A day counts as "complete" simply by having at least one row here for
// that day_number — there's no separate completion flag to keep in
// sync, which is what made the previous JSON-blob approach fragile
// across multiple devices/tabs.
const { getPool } = require("./_lib/db");
const { CORS, json, requireAuth } = require("./_lib/auth");

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };

  let decoded;
  try {
    decoded = requireAuth(event);
  } catch {
    return json(401, { error: "Not signed in." });
  }

  const pool = getPool();

  if (event.httpMethod === "GET") {
    try {
      const result = await pool.query(
        `select id, day_number, reflection_text, created_at
         from public.user_reflections
         where user_id = $1
         order by created_at asc`,
        [decoded.sub]
      );
      return json(200, { reflections: result.rows });
    } catch (e) {
      console.error("reflections GET error:", e);
      return json(500, { error: "Could not load your reflections." });
    }
  }

  if (event.httpMethod === "POST") {
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { error: "Invalid JSON body." });
    }
    const dayNumber = parseInt(body.day_number, 10);
    const text = String(body.reflection_text || "").trim();
    if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 21) {
      return json(400, { error: "day_number must be between 1 and 21." });
    }
    if (!text) return json(400, { error: "Reflection text can't be empty." });

    try {
      const result = await pool.query(
        `insert into public.user_reflections (user_id, day_number, reflection_text)
         values ($1, $2, $3)
         returning id, day_number, reflection_text, created_at`,
        [decoded.sub, dayNumber, text]
      );
      return json(201, { reflection: result.rows[0] });
    } catch (e) {
      console.error("reflections POST error:", e);
      return json(500, { error: "Could not save your reflection." });
    }
  }

  if (event.httpMethod === "DELETE") {
    const id = (event.queryStringParameters || {}).id;
    if (!id) return json(400, { error: "Missing id." });

    try {
      // The "and user_id = $2" is what stops anyone from deleting
      // someone else's reflection by guessing an id.
      const result = await pool.query(
        `delete from public.user_reflections where id = $1 and user_id = $2 returning id`,
        [id, decoded.sub]
      );
      if (result.rows.length === 0) return json(404, { error: "Reflection not found." });
      return json(200, { deleted: true });
    } catch (e) {
      console.error("reflections DELETE error:", e);
      return json(500, { error: "Could not delete that reflection." });
    }
  }

  return json(405, { error: "Use GET, POST, or DELETE." });
};
