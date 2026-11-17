import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

/**
 * Signed HS256 JWT access tokens. Claims, issuer, audience and key match the C#
 * JwtTokenService, so sessions issued before the migration stay valid.
 */
export function createToken(user) {
  const { key, issuer, audience, expiresHours } = config.jwt;
  return jwt.sign(
    {
      sub: String(user.Uid),
      unique_name: user.LoginId,
      name: user.Name,
      jti: crypto.randomUUID(),
    },
    key,
    { algorithm: 'HS256', issuer, audience, expiresIn: expiresHours * 3600, noTimestamp: true });
}

// The verified claims, or null when the header is missing or the token is bad.
function readToken(req) {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(req.get('authorization') ?? '');
  if (!match) return { claims: null, presented: false };
  try {
    const { key, issuer, audience } = config.jwt;
    // ASP.NET's default 5-minute clock skew.
    const claims = jwt.verify(match[1], key, { algorithms: ['HS256'], issuer, audience, clockTolerance: 300 });
    if (claims.exp == null) throw new Error('Token has no expiration.');
    return { claims, presented: true };
  } catch {
    return { claims: null, presented: true };
  }
}

/** Rejects requests without a valid bearer token with an empty 401. */
export function requireAuth(req, res, next) {
  const { claims, presented } = readToken(req);
  if (!claims) {
    res.set('WWW-Authenticate', presented ? 'Bearer error="invalid_token"' : 'Bearer');
    return res.status(401).end();
  }
  req.user = claims;
  next();
}

/** Attaches the user when a valid token is sent; anonymous requests still proceed. */
export function optionalAuth(req, res, next) {
  req.user = readToken(req).claims ?? undefined;
  next();
}

/** Uid of the signed-in user (the token's "sub") as digit text, or null. */
export function currentUserId(req) {
  const sub = req.user?.sub;
  return typeof sub === 'string' && /^-?\d{1,19}$/.test(sub) ? sub : null;
}
