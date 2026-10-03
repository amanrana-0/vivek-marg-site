// Verifies a "Sign in with Google" ID token (the `credential` the Google
// button hands the browser). Uses Google's public signing certificates and
// the jsonwebtoken package we already depend on, so no new npm package.
//
// The Client ID is public by design (it is also in index.html). It can be
// overridden with the GOOGLE_CLIENT_ID environment variable if it changes.
const jwt = require("jsonwebtoken");

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  "349713383126-3m26ahinmp5qqcuriud30kdn45u531s5.apps.googleusercontent.com";

const CERTS_URL = "https://www.googleapis.com/oauth2/v1/certs";
let certCache = { certs: null, expires: 0 };

async function getCerts(forceRefresh) {
  if (!forceRefresh && certCache.certs && Date.now() < certCache.expires) return certCache.certs;
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error("Could not fetch Google signing certificates");
  const certs = await res.json();
  // Respect Google's cache header; fall back to 1 hour.
  const m = /max-age=(\d+)/.exec(res.headers.get("cache-control") || "");
  certCache = { certs, expires: Date.now() + (m ? Number(m[1]) * 1000 : 3600 * 1000) };
  return certs;
}

// Returns { sub, email, name, picture } for a valid, verified Google
// account, or throws.
async function verifyGoogleIdToken(idToken) {
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || !decoded.header || !decoded.header.kid) throw new Error("Malformed Google token");

  let certs = await getCerts(false);
  // Google rotates keys; refresh once if the key id isn't in our cache.
  if (!certs[decoded.header.kid]) certs = await getCerts(true);
  const cert = certs[decoded.header.kid];
  if (!cert) throw new Error("Unknown Google signing key");

  const payload = jwt.verify(idToken, cert, {
    algorithms: ["RS256"],
    audience: GOOGLE_CLIENT_ID,
    issuer: ["accounts.google.com", "https://accounts.google.com"],
  });

  if (!payload.email || payload.email_verified !== true) {
    throw new Error("Google account email is not verified");
  }
  return {
    sub: String(payload.sub),
    email: String(payload.email).trim().toLowerCase(),
    name: String(payload.name || "").trim(),
    picture: payload.picture || null,
  };
}

module.exports = { verifyGoogleIdToken, GOOGLE_CLIENT_ID };
