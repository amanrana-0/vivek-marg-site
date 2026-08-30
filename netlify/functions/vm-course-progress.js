// GET  /api/course-progress                     -> all of MY progress rows
// PUT  /api/course-progress { session_number, patch } -> update one session's progress
//
// patch can include any of: pre_read_done, activity_done, quiz_score,
// quiz_total, reflection_text. A session counts as complete once both
// pre_read_done and activity_done are true, at which point completed_at
// is stamped — this is what the hub uses to decide what's unlocked.
const { getPool } = require("./_lib/db");
const { CORS, json, requireAuth } = require("./_lib/auth");

const ALLOWED_FIELDS = [
  "pre_read_done",
  "activity_done",
  "case_study_done",
  "quiz_score",
  "quiz_total",
  "quiz_answers",
  "reflection_text",
];

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
        `select session_number, pre_read_done, activity_done, case_study_done, quiz_score, quiz_answers,
                quiz_total, reflection_text, completed_at, updated_at
         from public.user_course_progress
         where user_id = $1`,
        [decoded.sub]
      );
      return json(200, { progress: result.rows });
    } catch (e) {
      console.error("course-progress GET error:", e);
      return json(500, { error: "Could not load your course progress." });
    }
  }

  if (event.httpMethod === "PUT") {
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { error: "Invalid JSON body." });
    }
    const sessionNumber = String(body.session_number || "").trim();
    const patch = body.patch && typeof body.patch === "object" ? body.patch : {};
    if (!sessionNumber) return json(400, { error: "Missing session_number." });

    const setClauses = [];
    const values = [decoded.sub, sessionNumber];
    for (const field of ALLOWED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(patch, field)) {
        if (field === "quiz_answers") {
          values.push(JSON.stringify(patch[field]));
          setClauses.push(`${field} = $${values.length}::jsonb`);
        } else {
          values.push(patch[field]);
          setClauses.push(`${field} = $${values.length}`);
        }
      }
    }
    if (setClauses.length === 0) return json(400, { error: "No recognised fields in patch." });

    try {
      // Upsert, then recompute completed_at from the row's own current state.
      await pool.query(
        `insert into public.user_course_progress (user_id, session_number)
         values ($1, $2)
         on conflict (user_id, session_number) do nothing`,
        [decoded.sub, sessionNumber]
      );

      await pool.query(
        `update public.user_course_progress
         set ${setClauses.join(", ")}, updated_at = now()
         where user_id = $1 and session_number = $2`,
        values
      );

      const result = await pool.query(
        `update public.user_course_progress
         set completed_at = case
               when pre_read_done and activity_done and completed_at is null then now()
               when not (pre_read_done and activity_done) then null
               else completed_at
             end
         where user_id = $1 and session_number = $2
         returning session_number, pre_read_done, activity_done, case_study_done, quiz_score, quiz_answers,
                   quiz_total, reflection_text, completed_at, updated_at`,
        [decoded.sub, sessionNumber]
      );

      return json(200, { progress: result.rows[0] });
    } catch (e) {
      console.error("course-progress PUT error:", e);
      return json(500, { error: "Could not save your progress." });
    }
  }

  return json(405, { error: "Use GET or PUT." });
};
