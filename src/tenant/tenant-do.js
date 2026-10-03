import { DurableObject } from 'cloudflare:workers';
import { json, errorResponse, Router, forbidden, unauthorized, HttpError } from '../lib/http.js';
import { DB, features } from './base.js';
import { MIGRATIONS } from './schema.js';
import { registerMaster, initTenant } from './master.js';
import { registerOrders } from './orders.js';
import { registerReports, dailyStats } from './reports.js';
import { registerInventory } from './inventory.js';
import { businessDate } from '../lib/time.js';

const router = new Router();
registerMaster(router);
registerOrders(router);
registerReports(router);
registerInventory(router);
router.on('POST', '/internal/push-stats', async t => { await t.pushStats(); return { ok: true }; }, { internal: true });

/** Event yang diteruskan ke perangkat back office (selain itu hanya ke perangkat outlet). */
const USER_EVENTS = new Set(['sale.new', 'order.updated', 'presence', 'shift.updated', 'ticket.new']);

export class TenantDO extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        this.db = new DB(ctx.storage.sql);
        ctx.blockConcurrencyWhile(async () => {
            this.migrate();
            if (!(await ctx.storage.getAlarm())) await ctx.storage.setAlarm(nextAlarmTime());
        });
        // Balas ping tanpa membangunkan objek (hemat biaya)
        ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    }

    migrate() {
        this.db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT) WITHOUT ROWID');
        const current = Number(this.db.getMeta('schema_version', 0));
        for (let v = current; v < MIGRATIONS.length; v++) {
            this.ctx.storage.transactionSync(() => {
                this.db.exec(MIGRATIONS[v]);
                this.db.setMeta('schema_version', v + 1);
            });
        }
    }

    async fetch(request) {
        try {
            const a = JSON.parse(request.headers.get('x-rp-ctx') || 'null');
            if (!a) throw unauthorized();
            const url = new URL(request.url);

            if (url.pathname === '/internal/init') return json(initTenant(this, await request.json()));

            // Pertahanan berlapis: konteks harus milik tenant pemilik penyimpanan ini
            const owner = this.db.getMeta('tenant_id');
            if (owner && a.tid && Number(owner) !== Number(a.tid)) throw forbidden('Akses tenant tidak valid');
            if (a.kind === 'device' && this.db.one('SELECT device_id FROM revoked_devices WHERE device_id = ?', a.device_id)) {
                throw unauthorized('Perangkat ini sudah dicabut aksesnya oleh pemilik', 'device_revoked');
            }
            if (a.kind === 'device' && a.device_type === 'kds' && !features(this).kds) {
                throw new HttpError(403, 'Fitur Layar Dapur (KDS) tidak aktif untuk usaha ini. Hubungi admin RasaPOS.', 'feature_disabled');
            }
            if (a.kind === 'device' && a.staff) {
                const st = this.db.one('SELECT is_active FROM staff WHERE id = ?', a.staff.id);
                if (!st || !st.is_active) throw unauthorized('Akun staff tidak aktif', 'staff_invalid');
            }

            if (url.pathname === '/ws') return this.acceptSocket(a);

            const m = router.match(request.method, url.pathname);
            if (!m) throw new HttpError(404, 'Endpoint tidak ditemukan', 'not_found');
            if (m.opts.internal && a.kind !== 'system') throw forbidden();
            if (a.kind === 'public' && !m.opts.public) throw unauthorized();
            const res = await m.handler(this, request, a, m.params, url);
            return res instanceof Response ? res : json(res);
        } catch (e) {
            return errorResponse(e);
        }
    }

    // ---------- Realtime ----------
    acceptSocket(a) {
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        const att = a.kind === 'device'
            ? { kind: 'device', device_id: a.device_id, device_type: a.device_type, device_name: a.device_name, outlet_id: Number(a.outlet_id), staff: a.staff ? a.staff.name : null, at: Date.now() }
            : { kind: 'user', user_id: a.user_id, outlet_ids: a.outlet_ids, at: Date.now() };
        this.ctx.acceptWebSocket(server, [a.kind === 'device' ? 'outlet:' + a.outlet_id : 'user']);
        server.serializeAttachment(att);
        if (att.kind === 'device') this.broadcastPresence(att.outlet_id);
        return new Response(null, { status: 101, webSocket: client });
    }

    webSocketMessage(ws, message) {
        if (message === 'ping') ws.send('pong');
    }

    webSocketClose(ws) {
        const att = ws.deserializeAttachment();
        try { ws.close(); } catch { /* sudah tertutup */ }
        if (att && att.kind === 'device') this.broadcastPresence(att.outlet_id, ws);
    }

    webSocketError(ws) { this.webSocketClose(ws); }

    devicesOnline(outletId, exclude) {
        return this.ctx.getWebSockets('outlet:' + outletId)
            .filter(ws => ws !== exclude && ws.readyState === 1)
            .map(ws => ws.deserializeAttachment())
            .filter(Boolean)
            .map(x => ({ device_id: x.device_id, name: x.device_name, type: x.device_type, staff: x.staff, since: x.at }));
    }

    broadcastPresence(outletId, exclude) {
        this.broadcast(outletId, 'presence', { outlet_id: outletId, devices: this.devicesOnline(outletId, exclude) });
    }

    /** Kirim event ke perangkat outlet & user back office yang berhak. */
    broadcast(outletId, type, data) {
        const msg = JSON.stringify({ type, data, at: Date.now() });
        for (const ws of this.ctx.getWebSockets('outlet:' + outletId)) { try { ws.send(msg); } catch { /* abaikan */ } }
        if (!USER_EVENTS.has(type)) return;
        for (const ws of this.ctx.getWebSockets('user')) {
            const att = ws.deserializeAttachment();
            if (!att || (att.outlet_ids !== null && !att.outlet_ids.map(Number).includes(Number(outletId)))) continue;
            try { ws.send(msg); } catch { /* abaikan */ }
        }
    }

    // ---------- Alarm harian: statistik → D1, bersih-bersih, backup ----------
    /** Kirim ringkasan harian ke D1 inti (untuk panel superadmin). */
    async pushStats() {
        const tenantId = this.db.getMeta('tenant_id');
        if (!tenantId) return;
        const online = this.ctx.getWebSockets().length;
        const stmt = this.env.CORE.prepare('INSERT OR REPLACE INTO tenant_stats (tenant_id, date, outlets, trx, sales, devices_online, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
        // Fitur: DO adalah sumber kebenaran; cermin di D1 (panel superadmin) diselaraskan ulang
        const f = this.db.getMeta('features');
        const featStmt = this.env.CORE.prepare('UPDATE tenants SET features = ? WHERE id = ?').bind(f && Object.keys(f).length ? JSON.stringify(f) : null, tenantId);
        await this.env.CORE.batch([...dailyStats(this).map(s => stmt.bind(tenantId, s.date, s.outlets, s.trx, s.sales, online, Date.now())), featStmt]);
    }

    async alarm() {
        try {
            const tenantId = this.db.getMeta('tenant_id');
            if (tenantId) {
                await this.pushStats();
                this.db.exec('DELETE FROM ops WHERE created_at < ?', Date.now() - 45 * 86400000);
                if (this.env.BACKUP) {
                    const { exportAll } = await import('./master.js');
                    const date = businessDate(Date.now(), 420, 0);
                    await this.env.BACKUP.put(`tenant-${tenantId}/${date}.json`, JSON.stringify(exportAll(this)), { httpMetadata: { contentType: 'application/json' } });
                }
            }
        } catch (e) {
            console.error('alarm gagal', e);
        }
        await this.ctx.storage.setAlarm(nextAlarmTime());
    }
}

/** Alarm berikutnya: 20:30 UTC (03:30 WIB) */
function nextAlarmTime() {
    const d = new Date();
    d.setUTCHours(20, 30, 0, 0);
    if (d.getTime() <= Date.now()) d.setUTCDate(d.getUTCDate() + 1);
    return d.getTime();
}
