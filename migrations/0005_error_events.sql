-- Pemantauan: error server (5xx) untuk panel superadmin & ringkasan harian. Dibersihkan setelah 30 hari.
CREATE TABLE IF NOT EXISTS error_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    method TEXT,
    path TEXT,
    status INTEGER,
    message TEXT,
    tenant_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_error_events_at ON error_events(at);
