-- Fitur per tenant yang diatur superadmin (KDS, meja, inventori, promo, AI). NULL = semua aktif.
ALTER TABLE tenants ADD COLUMN features TEXT;
