// Bukti persetujuan manager untuk operasi yang tertunda/offline.
// Tablet mengenkripsi { s: staff_id, p: PIN, o: op_id } dengan kunci publik RSA-OAEP milik tenant;
// hanya Durable Object (pemegang kunci privat) yang bisa membukanya, lalu PIN diverifikasi di server.
// Akibatnya: PIN tidak pernah tersimpan terbuka di tablet, dan persetujuan tidak bisa dipalsukan
// hanya dengan mengirim ID manager.
import { b64urlDecode } from '../lib/crypto.js';

const ALG = { name: 'RSA-OAEP', hash: 'SHA-256' };

async function generate(t) {
    const pair = await crypto.subtle.generateKey({ ...ALG, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['encrypt', 'decrypt']);
    const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
    const priv = await crypto.subtle.exportKey('jwk', pair.privateKey);
    const kid = crypto.randomUUID().slice(0, 8);
    t.db.setMeta('approval_key', { kid, pub: { kty: pub.kty, n: pub.n, e: pub.e }, priv });
    return t.db.getMeta('approval_key');
}

/** Kunci tenant (dibuat sekali, disimpan di meta DO). Promise di-cache agar permintaan bersamaan tidak membuat dua kunci. */
function keyRecord(t) {
    const stored = t.db.getMeta('approval_key');
    if (stored) return Promise.resolve(stored);
    t._approvalKeyP ||= generate(t).finally(() => { t._approvalKeyP = null; });
    return t._approvalKeyP;
}

export async function approvalPublicKey(t) {
    const k = await keyRecord(t);
    return { kid: k.kid, alg: 'RSA-OAEP-256', jwk: k.pub };
}

/** Buka bukti → { staff_id, pin, op_id }. Melempar Error bila rusak/kunci lain. */
export async function openApprovalProof(t, proof) {
    const k = await keyRecord(t);
    const [kid, data] = String(proof || '').split('.');
    if (!kid || !data || kid !== k.kid) throw new Error('kunci bukti tidak cocok');
    const priv = await crypto.subtle.importKey('jwk', k.priv, ALG, false, ['decrypt']);
    const plain = await crypto.subtle.decrypt(ALG, priv, b64urlDecode(data));
    const o = JSON.parse(new TextDecoder().decode(plain));
    return { staff_id: Number(o.s), pin: String(o.p || ''), op_id: String(o.o || '') };
}
