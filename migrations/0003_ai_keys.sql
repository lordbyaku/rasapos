-- Asisten panduan AI: API key Gemini dikelola superadmin (maks. 5, dipakai bergiliran).
-- Kunci disimpan terenkripsi AES-GCM (kunci enkripsi diturunkan dari secret JWT_SECRET).
CREATE TABLE IF NOT EXISTS ai_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    key_enc TEXT NOT NULL,
    key_hint TEXT NOT NULL,          -- 4 karakter terakhir, untuk ditampilkan
    is_active INTEGER NOT NULL DEFAULT 1,
    uses INTEGER NOT NULL DEFAULT 0,
    fails INTEGER NOT NULL DEFAULT 0,
    last_used_at INTEGER,
    last_ok_at INTEGER,
    last_error TEXT,
    last_error_at INTEGER,
    cooldown_until INTEGER,          -- dilewati sampai waktu ini (kena limit / kunci ditolak)
    created_at INTEGER NOT NULL
);

-- Pengaturan aplikasi global (model AI, batas harian, penunjuk giliran round robin)
CREATE TABLE IF NOT EXISTS app_settings (
    k TEXT PRIMARY KEY,
    v TEXT
);
