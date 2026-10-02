import { bad } from './http.js';

/** Validasi field berdasarkan spesifikasi sederhana. Mengembalikan objek bersih. */
export function pick(body, spec, { partial = false } = {}) {
    const out = {};
    for (const [key, rule] of Object.entries(spec)) {
        let v = body[key];
        if (v === undefined) {
            if (partial) continue;
            if (rule.required) throw bad(`${rule.label || key} wajib diisi`);
            if ('default' in rule) out[key] = typeof rule.default === 'function' ? rule.default() : rule.default;
            continue;
        }
        out[key] = coerce(key, v, rule);
    }
    return out;
}

function coerce(key, v, rule) {
    const label = rule.label || key;
    switch (rule.type) {
        case 'str': {
            if (v === null) v = '';
            v = String(v).trim();
            if (rule.required && !v) throw bad(`${label} wajib diisi`);
            if (rule.max && v.length > rule.max) throw bad(`${label} maksimal ${rule.max} karakter`);
            if (rule.min && v.length < rule.min) throw bad(`${label} minimal ${rule.min} karakter`);
            if (rule.pattern && v && !rule.pattern.test(v)) throw bad(`${label} tidak valid`);
            if (rule.enum && !rule.enum.includes(v)) throw bad(`${label} tidak valid`);
            return v;
        }
        case 'int':
        case 'num': {
            if (v === '' || v === null) v = rule.default ?? 0;
            const n = Number(v);
            if (!Number.isFinite(n)) throw bad(`${label} harus angka`);
            const x = rule.type === 'int' ? Math.round(n) : n;
            if (rule.min !== undefined && x < rule.min) throw bad(`${label} minimal ${rule.min}`);
            if (rule.max !== undefined && x > rule.max) throw bad(`${label} maksimal ${rule.max}`);
            return x;
        }
        case 'bool':
            return v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0;
        case 'json':
            if (rule.array && !Array.isArray(v)) throw bad(`${label} harus berupa daftar`);
            return JSON.stringify(v ?? (rule.array ? [] : {}));
        case 'idnull':
            return v === null || v === '' ? null : Math.round(Number(v)) || null;
        default:
            return v;
    }
}

export const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || '');
