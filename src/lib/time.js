/** Tanggal bisnis outlet (YYYY-MM-DD) dengan memperhitungkan zona waktu & jam tutup hari. */
export function businessDate(ms, tzOffsetMin = 420, cutoffHour = 4) {
    const d = new Date(ms + tzOffsetMin * 60000 - cutoffHour * 3600000);
    return d.toISOString().slice(0, 10);
}

/** Jam lokal outlet (0-23) */
export function localHour(ms, tzOffsetMin = 420) {
    return new Date(ms + tzOffsetMin * 60000).getUTCHours();
}

export function todayUTC() {
    return new Date().toISOString().slice(0, 10);
}

export function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}
