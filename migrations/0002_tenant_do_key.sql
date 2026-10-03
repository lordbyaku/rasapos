-- Kunci penyimpanan Durable Object per tenant.
-- Tenant baru mendapat kunci acak, sehingga data tidak pernah tertukar walau D1 dibuat ulang
-- (ID AUTOINCREMENT bisa terulang di database baru). Tenant lama tetap memakai kunci lama 'tenant:<id>'.
ALTER TABLE tenants ADD COLUMN do_key TEXT;
UPDATE tenants SET do_key = 'tenant:' || id WHERE do_key IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_do_key ON tenants(do_key);
