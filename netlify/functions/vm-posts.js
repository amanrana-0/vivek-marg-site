// GET /api/posts   (also reachable directly at /.netlify/functions/vm-posts)
// Public, read-only. Returns published rows from vivekmarg_posts as JSON,
// newest first (or by display_order when set). No auth required — this
// powers the public Blogs & Posts page, same as the public course map.
const { getPool } = require("./_lib/db");
const { CORS, json } = require("./_lib/auth");

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "GET") return json(405, { error: "Use GET." });

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `select id, author_name, author_avatar_url, content, image_url, is_story, created_at
       from public.vivekmarg_posts
       where is_published = true
       order by display_order asc nulls last, created_at desc
       limit 50;`
    );
    return json(200, rows);
  } catch (e) {
    console.error("vm-posts error:", e);
    return json(500, { error: "Something went wrong loading posts." });
  }
};
