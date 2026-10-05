-- Paket langganan: basic (tanpa KDS & Inventori) | pro (semua fitur). Tenant lama & trial = pro.
ALTER TABLE tenants ADD COLUMN plan TEXT NOT NULL DEFAULT 'pro';
