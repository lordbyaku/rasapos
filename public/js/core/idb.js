// Pembungkus IndexedDB kecil: kv (cache), outbox (antrean operasi), orders (order lokal)
const IDB = {
    _db: null,
    open() {
        if (this._db) return Promise.resolve(this._db);
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('rasapos', 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
                if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
                if (!db.objectStoreNames.contains('orders')) db.createObjectStore('orders', { keyPath: 'id' });
            };
            req.onsuccess = () => { this._db = req.result; resolve(this._db); };
            req.onerror = () => reject(req.error);
        });
    },
    async _tx(store, mode, fn) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(store, mode);
            const req = fn(tx.objectStore(store));
            tx.oncomplete = () => resolve(req ? req.result : undefined);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    },
    get(store, key) { return this._tx(store, 'readonly', s => s.get(key)); },
    set(store, key, val) { return this._tx(store, 'readwrite', s => (s.keyPath ? s.put(val) : s.put(val, key))); },
    put(store, val) { return this._tx(store, 'readwrite', s => s.put(val)); },
    del(store, key) { return this._tx(store, 'readwrite', s => s.delete(key)); },
    all(store) { return this._tx(store, 'readonly', s => s.getAll()); },
    count(store) { return this._tx(store, 'readonly', s => s.count()); },
    clear(store) { return this._tx(store, 'readwrite', s => s.clear()); }
};
