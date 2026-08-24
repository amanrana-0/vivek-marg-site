const jwt = require("jsonwebtoken");

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
};

function json(statusCode, body) {
  return { statusCode, headers: CORS, body: JSON.stringify(body) };
}

function getSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error(
      "JWT_SECRET is not set. Add it in Netlify: Site settings -> " +
      "Environment variables -> JWT_SECRET (use a long random string)."
    );
  }
  return process.env.JWT_SECRET;
}

// Token identifies a vivekmarg_users row only. It intentionally carries
// no role/permission claims, since this account type has none of the
// staff/RP permissions that exist on public.users.
function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, kind: "vivekmarg_user" },
    getSecret(),
    { expiresIn: "30d" }
  );
}

// Reads the Bearer token from the request, verifies it, and returns the
// decoded payload. Throws on missing/invalid/expired token or on a
// token that isn't one of ours (kind check) — callers should catch and
// respond 401.
function requireAuth(event) {
  const header = event.headers.authorization || event.headers.Authorization || "";
  const match = header.match(/^Bearer (.+)$/i);
  if (!match) throw new Error("Missing Authorization header");
  const decoded = jwt.verify(match[1], getSecret());
  if (decoded.kind !== "vivekmarg_user") throw new Error("Wrong token type");
  return decoded;
}

module.exports = { CORS, json, signToken, requireAuth };
