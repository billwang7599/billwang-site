// Cloudflare Access gate. Access sits in front of /edit/* and attaches a signed
// JWT to every request it lets through; this verifies it, so the Worker never
// trusts a bare header. Fails closed: missing config, missing token or any
// verification problem all read as "not signed in".

interface Jwk extends JsonWebKey {
  kid: string;
}

const KEY_TTL_MS = 60 * 60 * 1000;
let keyCache: { at: number; keys: Jwk[] } | null = null;

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function b64urlToJson<T>(s: string): T {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s))) as T;
}

async function getKeys(team: string, force = false): Promise<Jwk[]> {
  if (!force && keyCache && Date.now() - keyCache.at < KEY_TTL_MS) return keyCache.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs ${res.status}`);
  const { keys } = (await res.json()) as { keys: Jwk[] };
  keyCache = { at: Date.now(), keys };
  return keys;
}

async function verify(token: string, team: string, aud: string): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [h, p, s] = parts;

  const header = b64urlToJson<{ alg?: string; kid?: string }>(h);
  if (header.alg !== 'RS256' || !header.kid) return false;

  let jwk = (await getKeys(team)).find((k) => k.kid === header.kid);
  // Unknown kid: Access may have rotated keys since we cached them.
  if (!jwk) jwk = (await getKeys(team, true)).find((k) => k.kid === header.kid);
  if (!jwk) return false;

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(s),
    new TextEncoder().encode(`${h}.${p}`),
  );
  if (!valid) return false;

  const claims = b64urlToJson<{ iss?: string; aud?: string | string[]; exp?: number; nbf?: number }>(p);
  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  return (
    claims.iss === `https://${team}` &&
    audiences.includes(aud) &&
    typeof claims.exp === 'number' &&
    claims.exp > now &&
    (claims.nbf === undefined || claims.nbf <= now)
  );
}

export async function isSignedIn(request: Request, env: Env): Promise<boolean> {
  const team = env.ACCESS_TEAM_DOMAIN;
  const aud = env.ACCESS_AUD;
  if (!team || !aud) return false;

  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return false;

  try {
    return await verify(token, team, aud);
  } catch {
    return false;
  }
}
