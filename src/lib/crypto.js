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

// Enkripsi data rahasia di database (mis. API key pihak ketiga). Format: v1.<iv>.<ciphertext>
const aesKeys = new Map();
async function aesKey(secret, purpose) {
    const id = purpose + '\u0000' + secret;
    if (!aesKeys.has(id)) {
        const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'HKDF', false, ['deriveKey']);
        aesKeys.set(id, await crypto.subtle.deriveKey(
            { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('rasapos'), info: enc.encode(purpose) },
            base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']));
    }
    return aesKeys.get(id);
}

export async function encryptText(text, secret, purpose) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret, purpose), enc.encode(text));
    return `v1.${b64url(iv)}.${b64url(ct)}`;
}

export async function decryptText(stored, secret, purpose) {
    const [v, iv, ct] = String(stored || '').split('.');
    if (v !== 'v1' || !iv || !ct) throw new Error('format terenkripsi tidak dikenal');
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64urlDecode(iv) }, await aesKey(secret, purpose), b64urlDecode(ct));
    return new TextDecoder().decode(pt);
}
