// GET /api/course                      -> list of parts + sessions (title/hook only, no content) — public
// GET /api/course?session=1.1          -> full content for one session — requires sign-in
//
// The list view never includes the "content" jsonb column, so a logged-out
// visitor can see the shape of the course (what's coming) without ever
// receiving the actual pre-read, quiz answers, or activity text.
const { getPool } = require("./_lib/db");
const { CORS, json, requireAuth } = require("./_lib/auth");

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "GET") return json(405, { error: "Use GET." });

  const pool = getPool();
  const sessionNumber = (event.queryStringParameters || {}).session;

  if (sessionNumber) {
    // Full session content is gated — must be signed in.
    let decoded;
    try {
      decoded = requireAuth(event);
    } catch {
      return json(401, { error: "Sign in to view this session." });
    }

    try {
      const result = await pool.query(
        `select session_number, part_number, order_in_part, topic_title, hook,
                duration_minutes, content
         from public.course_sessions
         where session_number = $1`,
        [sessionNumber]
      );
      if (result.rows.length === 0) return json(404, { error: "Session not found." });

      // Record that this session was opened (upsert progress row), but
      // don't overwrite anything already marked done on it.
      await pool.query(
        `insert into public.user_course_progress (user_id, session_number)
         values ($1, $2)
         on conflict (user_id, session_number) do update set updated_at = now()`,
        [decoded.sub, sessionNumber]
      );

      return json(200, { session: result.rows[0] });
    } catch (e) {
      console.error("course GET session error:", e);
      return json(500, { error: "Could not load this session." });
    }
  }

  // No ?session= given: return the public course map (no gated content).
  try {
    const parts = await pool.query(
      `select part_number, title, summary from public.course_parts order by part_number`
    );
    const sessions = await pool.query(
      `select session_number, part_number, order_in_part, topic_title, hook, duration_minutes
       from public.course_sessions order by part_number, order_in_part`
    );
    return json(200, { parts: parts.rows, sessions: sessions.rows });
  } catch (e) {
    console.error("course GET map error:", e);
    return json(500, { error: "Could not load the course." });
  }
};
