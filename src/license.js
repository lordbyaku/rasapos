const DAY = 86400000;

/**
 * Status lisensi tenant.
 * state: trial | active | grace | expired | suspended
 * writable: boleh membuat transaksi baru
 */
export function licenseOf(tenant, env, now = Date.now()) {
    const perPack = Number(env.OUTLETS_PER_PACK || 5);
    const grace = Number(env.GRACE_DAYS || 3) * DAY;
    const packs = Number(tenant.outlet_packs || 0);
    const paidMax = Math.max(packs, 1) * perPack;
    const trialEnd = Number(tenant.trial_ends_at || 0);
    const paidEnd = Number(tenant.paid_until || 0);

    if (tenant.status === 'suspended') return { state: 'suspended', writable: false, max_outlets: packs ? paidMax : 1, until: paidEnd || trialEnd };
    if (paidEnd > now) return { state: 'active', writable: true, max_outlets: paidMax, until: paidEnd };
    if (trialEnd > now) return { state: 'trial', writable: true, max_outlets: packs ? paidMax : 1, until: trialEnd };
    const end = Math.max(paidEnd, trialEnd);
    if (now < end + grace) return { state: 'grace', writable: true, max_outlets: packs ? paidMax : 1, until: end, grace_until: end + grace };
    return { state: 'expired', writable: false, max_outlets: packs ? paidMax : 1, until: end };
}

/** Bentuk ringkas untuk disisipkan di token. */
export const licClaim = l => ({ s: l.state, w: l.writable ? 1 : 0, mo: l.max_outlets, u: l.until });
