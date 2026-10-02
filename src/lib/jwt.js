import { b64url, b64urlDecode, hmacKey } from './crypto.js';
import { unauthorized } from './http.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
const keyCache = new Map();

async function key(secret) {
    if (!secret || secret.length < 16) throw new Error('JWT_SECRET belum diatur (minimal 16 karakter)');
    if (!keyCache.has(secret)) keyCache.set(secret, await hmacKey(secret));
    return keyCache.get(secret);
}

export async function signJwt(payload, secret, ttlSeconds) {
    const now = Math.floor(Date.now() / 1000);
    const body = { ...payload, iat: now, exp: now + ttlSeconds };
    const head = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
    const data = b64url(enc.encode(JSON.stringify(body)));
    const sig = await crypto.subtle.sign('HMAC', await key(secret), enc.encode(`${head}.${data}`));
    return `${head}.${data}.${b64url(sig)}`;
}

export async function verifyJwt(token, secret, expectedTyp) {
    if (!token || typeof token !== 'string') throw unauthorized();
    const parts = token.split('.');
    if (parts.length !== 3) throw unauthorized('Token tidak valid', 'invalid_token');
    let ok = false;
    try {
        ok = await crypto.subtle.verify('HMAC', await key(secret), b64urlDecode(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));
    } catch { ok = false; }
    if (!ok) throw unauthorized('Token tidak valid', 'invalid_token');
    const payload = JSON.parse(dec.decode(b64urlDecode(parts[1])));
    if (payload.exp < Math.floor(Date.now() / 1000)) throw unauthorized('Sesi kedaluwarsa', 'token_expired');
    if (expectedTyp && payload.typ !== expectedTyp) throw unauthorized('Jenis token salah', 'invalid_token');
    return payload;
}
