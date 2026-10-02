-- Database inti (D1): akun, tenant, perangkat, langganan.
-- Data bisnis tiap tenant disimpan di Durable Object TenantDO (SQLite terpisah per tenant).

CREATE TABLE IF NOT EXISTS tenants (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    owner_user_id   INTEGER,
    phone           TEXT,
    status          TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'suspended')),
    trial_ends_at   INTEGER NOT NULL,
    paid_until      INTEGER,
    outlet_packs    INTEGER NOT NULL DEFAULT 0,
    note            TEXT,
    created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash   TEXT NOT NULL,
    name            TEXT NOT NULL,
    tenant_id       INTEGER REFERENCES tenants(id),
    role            TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'manager')),
    outlet_ids      TEXT,              -- JSON array; NULL = semua outlet
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      INTEGER NOT NULL,
    last_login_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    token_hash      TEXT PRIMARY KEY,
    user_id         INTEGER NOT NULL,
    expires_at      INTEGER NOT NULL,
    revoked_at      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS devices (
    id              TEXT PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    outlet_id       INTEGER NOT NULL,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL CHECK (type IN ('pos', 'kds')),
    code            TEXT NOT NULL,
    secret_hash     TEXT NOT NULL,
    created_at      INTEGER NOT NULL,
    revoked_at      INTEGER,
    last_seen_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_devices_tenant ON devices(tenant_id, outlet_id);

CREATE TABLE IF NOT EXISTS pair_codes (
    code            TEXT PRIMARY KEY,
    tenant_id       INTEGER NOT NULL,
    outlet_id       INTEGER NOT NULL,
    type            TEXT NOT NULL,
    name            TEXT NOT NULL,
    created_by      INTEGER,
    expires_at      INTEGER NOT NULL,
    used_at         INTEGER
);

CREATE TABLE IF NOT EXISTS password_resets (
    token_hash      TEXT PRIMARY KEY,
    user_id         INTEGER NOT NULL,
    expires_at      INTEGER NOT NULL,
    used_at         INTEGER
);

CREATE TABLE IF NOT EXISTS login_attempts (
    key             TEXT PRIMARY KEY,
    count           INTEGER NOT NULL,
    window_start    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tenant_stats (
    tenant_id       INTEGER NOT NULL,
    date            TEXT NOT NULL,
    outlets         INTEGER NOT NULL DEFAULT 0,
    trx             INTEGER NOT NULL DEFAULT 0,
    sales           INTEGER NOT NULL DEFAULT 0,
    devices_online  INTEGER NOT NULL DEFAULT 0,
    updated_at      INTEGER NOT NULL,
    PRIMARY KEY (tenant_id, date)
);

CREATE TABLE IF NOT EXISTS subscription_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id       INTEGER NOT NULL,
    action          TEXT NOT NULL,
    detail          TEXT,
    by_user         INTEGER,
    created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sublogs_tenant ON subscription_logs(tenant_id, created_at);
