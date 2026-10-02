const enc = new TextEncoder();

export function b64url(bytes) {
    let s = '';
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(str) {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
}

export function randomToken(bytes = 32) {
    return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function randomDigits(n) {
    const a = crypto.getRandomValues(new Uint32Array(n));
    return Array.from(a, x => x % 10).join('');
}

export async function sha256(text) {
    const d = await crypto.subtle.digest('SHA-256', enc.encode(text));
    return b64url(d);
}

/** Hash password/PIN dengan PBKDF2-SHA256. Format: pbkdf2$iter$salt$hash */
export async function hashSecret(secret, iterations, salt = randomToken(16)) {
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations }, key, 256);
    return `pbkdf2$${iterations}$${salt}$${b64url(bits)}`;
}

export async function verifySecret(secret, stored) {
    if (!stored || typeof stored !== 'string') return false;
    const [alg, iter, salt, hash] = stored.split('$');
    if (alg !== 'pbkdf2' || !hash) return false;
    const again = await hashSecret(secret, Number(iter), salt);
    return timingSafeEqual(again.split('$')[3], hash);
}

export function timingSafeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

export async function hmacKey(secret) {
    return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
