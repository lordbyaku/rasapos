// Migrasi skema SQLite per tenant (Durable Object). Tambahkan migrasi baru di akhir array; jangan ubah yang lama.
export const MIGRATIONS = [
    // v1 — skema awal
    `
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT) WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS outlets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        address TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        tz_offset_min INTEGER NOT NULL DEFAULT 420,
        day_cutoff_hour INTEGER NOT NULL DEFAULT 4,
        tax_rate REAL NOT NULL DEFAULT 10,
        tax_label TEXT NOT NULL DEFAULT 'PBJT',
        service_rate REAL NOT NULL DEFAULT 0,
        tax_on_service INTEGER NOT NULL DEFAULT 1,
        tax_inclusive INTEGER NOT NULL DEFAULT 0,
        cash_rounding INTEGER NOT NULL DEFAULT 100,
        receipt_header TEXT DEFAULT '',
        receipt_footer TEXT DEFAULT 'Terima kasih',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS staff (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        pin_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('manager','cashier','waiter','kitchen')),
        outlet_ids TEXT NOT NULL DEFAULT '[]',
        permissions TEXT,
        failed INTEGER NOT NULL DEFAULT 0,
        locked_until INTEGER,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#f97316',
        station TEXT NOT NULL DEFAULT 'Dapur',
        sort INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS modifier_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        min_select INTEGER NOT NULL DEFAULT 0,
        max_select INTEGER NOT NULL DEFAULT 1,
        options TEXT NOT NULL DEFAULT '[]',
        is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS menus (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER,
        name TEXT NOT NULL,
        sku TEXT DEFAULT '',
        description TEXT DEFAULT '',
        price INTEGER NOT NULL DEFAULT 0,
        station TEXT,
        taxable INTEGER NOT NULL DEFAULT 1,
        image_id TEXT,
        color TEXT,
        modifier_group_ids TEXT NOT NULL DEFAULT '[]',
        recipe TEXT NOT NULL DEFAULT '[]',
        is_active INTEGER NOT NULL DEFAULT 1,
        sort INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_menus_cat ON menus(category_id);

    CREATE TABLE IF NOT EXISTS outlet_menus (
        outlet_id INTEGER NOT NULL,
        menu_id INTEGER NOT NULL,
        price INTEGER,
        is_available INTEGER NOT NULL DEFAULT 1,
        sold_out_date TEXT,
        PRIMARY KEY (outlet_id, menu_id)
    ) WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS channel_prices (
        channel TEXT NOT NULL,
        menu_id INTEGER NOT NULL,
        price INTEGER NOT NULL,
        PRIMARY KEY (channel, menu_id)
    ) WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS areas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        outlet_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        sort INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        outlet_id INTEGER NOT NULL,
        area_id INTEGER,
        name TEXT NOT NULL,
        capacity INTEGER NOT NULL DEFAULT 4,
        sort INTEGER NOT NULL DEFAULT 0,
        dirty INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_tables_outlet ON tables(outlet_id);

    CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT DEFAULT '',
        email TEXT DEFAULT '',
        note TEXT DEFAULT '',
        points INTEGER NOT NULL DEFAULT 0,
        visits INTEGER NOT NULL DEFAULT 0,
        total_spent INTEGER NOT NULL DEFAULT 0,
        last_visit_at INTEGER,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

    CREATE TABLE IF NOT EXISTS promos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('percent','amount')),
        value INTEGER NOT NULL,
        min_subtotal INTEGER NOT NULL DEFAULT 0,
        days TEXT NOT NULL DEFAULT '[]',
        start_time TEXT DEFAULT '',
        end_time TEXT DEFAULT '',
        start_date TEXT DEFAULT '',
        end_date TEXT DEFAULT '',
        outlet_ids TEXT NOT NULL DEFAULT '[]',
        channels TEXT NOT NULL DEFAULT '[]',
        auto_apply INTEGER NOT NULL DEFAULT 1,
        is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS shifts (
        id TEXT PRIMARY KEY,
        outlet_id INTEGER NOT NULL,
        device_id TEXT,
        staff_id INTEGER,
        staff_name TEXT,
        business_date TEXT NOT NULL,
        opening_cash INTEGER NOT NULL DEFAULT 0,
        expected_cash INTEGER,
        closing_cash INTEGER,
        status TEXT NOT NULL DEFAULT 'open',
        summary TEXT,
        note TEXT DEFAULT '',
        opened_at INTEGER NOT NULL,
        closed_at INTEGER,
        closed_by INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_shifts_outlet ON shifts(outlet_id, business_date);

    CREATE TABLE IF NOT EXISTS cash_movements (
        id TEXT PRIMARY KEY,
        shift_id TEXT NOT NULL,
        outlet_id INTEGER NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('in','out','no_sale')),
        amount INTEGER NOT NULL DEFAULT 0,
        note TEXT DEFAULT '',
        staff_id INTEGER,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cash_shift ON cash_movements(shift_id);

    CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        outlet_id INTEGER NOT NULL,
        order_no TEXT NOT NULL,
        business_date TEXT NOT NULL,
        type TEXT NOT NULL,
        channel TEXT NOT NULL,
        table_id INTEGER,
        status TEXT NOT NULL,
        customer_id INTEGER,
        staff_id INTEGER,
        shift_id TEXT,
        total INTEGER NOT NULL DEFAULT 0,
        data TEXT NOT NULL,
        opened_at INTEGER NOT NULL,
        closed_at INTEGER,
        updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(outlet_id, business_date);
    CREATE INDEX IF NOT EXISTS idx_orders_open ON orders(outlet_id, status) WHERE status = 'open';
    CREATE INDEX IF NOT EXISTS idx_orders_shift ON orders(shift_id);

    CREATE TABLE IF NOT EXISTS kitchen_tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        outlet_id INTEGER NOT NULL,
        order_id TEXT NOT NULL,
        ticket_no INTEGER NOT NULL,
        station TEXT NOT NULL,
        label TEXT NOT NULL,
        order_type TEXT,
        items TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new',
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        done_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_tickets_active ON kitchen_tickets(outlet_id, status);
    CREATE INDEX IF NOT EXISTS idx_tickets_order ON kitchen_tickets(order_id);

    CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, value INTEGER NOT NULL) WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS ops (
        op_id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        ok INTEGER NOT NULL,
        result TEXT,
        created_at INTEGER NOT NULL
    ) WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS sales_daily (
        outlet_id INTEGER NOT NULL, business_date TEXT NOT NULL, channel TEXT NOT NULL,
        trx INTEGER NOT NULL DEFAULT 0, guests INTEGER NOT NULL DEFAULT 0, gross INTEGER NOT NULL DEFAULT 0,
        discount INTEGER NOT NULL DEFAULT 0, net INTEGER NOT NULL DEFAULT 0, service INTEGER NOT NULL DEFAULT 0,
        tax INTEGER NOT NULL DEFAULT 0, rounding INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
        commission INTEGER NOT NULL DEFAULT 0, tip INTEGER NOT NULL DEFAULT 0, cost INTEGER NOT NULL DEFAULT 0,
        refund_trx INTEGER NOT NULL DEFAULT 0, refund_total INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (outlet_id, business_date, channel)
    ) WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS sales_hourly (
        outlet_id INTEGER NOT NULL, business_date TEXT NOT NULL, hour INTEGER NOT NULL,
        trx INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (outlet_id, business_date, hour)
    ) WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS sales_items_daily (
        outlet_id INTEGER NOT NULL, business_date TEXT NOT NULL, item_key TEXT NOT NULL,
        menu_id INTEGER, name TEXT NOT NULL, category_id INTEGER,
        qty INTEGER NOT NULL DEFAULT 0, gross INTEGER NOT NULL DEFAULT 0, cost INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (outlet_id, business_date, item_key)
    ) WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS payments_daily (
        outlet_id INTEGER NOT NULL, business_date TEXT NOT NULL, method TEXT NOT NULL,
        name TEXT, count INTEGER NOT NULL DEFAULT 0, amount INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (outlet_id, business_date, method)
    ) WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS day_closes (
        outlet_id INTEGER NOT NULL, business_date TEXT NOT NULL,
        summary TEXT NOT NULL, closed_by TEXT, closed_at INTEGER NOT NULL,
        PRIMARY KEY (outlet_id, business_date)
    ) WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL, phone TEXT DEFAULT '', note TEXT DEFAULT '', is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS ingredients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        unit TEXT NOT NULL DEFAULT 'gr',
        cost REAL NOT NULL DEFAULT 0,
        min_stock REAL NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS stock (
        outlet_id INTEGER NOT NULL, ingredient_id INTEGER NOT NULL, qty REAL NOT NULL DEFAULT 0,
        PRIMARY KEY (outlet_id, ingredient_id)
    ) WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS stock_moves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        outlet_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        ref TEXT,
        items TEXT NOT NULL,
        note TEXT DEFAULT '',
        total_cost INTEGER NOT NULL DEFAULT 0,
        by_name TEXT,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_moves_outlet ON stock_moves(outlet_id, created_at);

    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        outlet_id INTEGER,
        action TEXT NOT NULL,
        ref TEXT,
        actor TEXT,
        data TEXT,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(created_at);

    CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, mime TEXT NOT NULL, data BLOB NOT NULL, created_at INTEGER NOT NULL) WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS revoked_devices (device_id TEXT PRIMARY KEY, revoked_at INTEGER NOT NULL) WITHOUT ROWID;
    `
];

export const DEFAULT_CHANNELS = [
    { code: 'dine_in', name: 'Dine-in', type: 'dine_in', markup_pct: 0, commission_pct: 0, active: true },
    { code: 'take_away', name: 'Take Away', type: 'take_away', markup_pct: 0, commission_pct: 0, active: true },
    { code: 'delivery', name: 'Delivery', type: 'delivery', markup_pct: 0, commission_pct: 0, active: false },
    { code: 'gofood', name: 'GoFood', type: 'online', markup_pct: 20, commission_pct: 20, active: true },
    { code: 'grabfood', name: 'GrabFood', type: 'online', markup_pct: 20, commission_pct: 20, active: true },
    { code: 'shopeefood', name: 'ShopeeFood', type: 'online', markup_pct: 20, commission_pct: 20, active: false }
];

export const DEFAULT_PAYMENT_METHODS = [
    { code: 'cash', name: 'Tunai', type: 'cash', active: true },
    { code: 'qris', name: 'QRIS', type: 'noncash', active: true },
    { code: 'debit', name: 'Kartu Debit', type: 'noncash', active: true },
    { code: 'credit', name: 'Kartu Kredit', type: 'noncash', active: false },
    { code: 'transfer', name: 'Transfer', type: 'noncash', active: true },
    { code: 'gopay', name: 'GoPay', type: 'noncash', active: false },
    { code: 'ovo', name: 'OVO', type: 'noncash', active: false },
    { code: 'online', name: 'Bayar di Aplikasi', type: 'noncash', active: true },
    { code: 'ar', name: 'Piutang', type: 'noncash', active: false },
    { code: 'compliment', name: 'Kompliment', type: 'noncash', active: true }
];

export const DEFAULT_SETTINGS = {
    loyalty: { enabled: false, amount_per_point: 10000 },
    discount_limit_pct: 10, // diskon manual di atas ini butuh PIN manager
    stations: ['Dapur', 'Bar', 'Pastry']
};

// Hak akses default per peran staff (PIN)
export const ROLE_PERMS = {
    manager: ['order', 'pay', 'void', 'discount', 'refund', 'shift', 'cash', 'reprint', 'table', 'soldout', 'close_day', 'kds', 'reports', 'inventory'],
    cashier: ['order', 'pay', 'shift', 'cash', 'reprint', 'table', 'soldout'],
    waiter: ['order', 'table'],
    kitchen: ['kds']
};
export const ALL_STAFF_PERMS = ROLE_PERMS.manager;
