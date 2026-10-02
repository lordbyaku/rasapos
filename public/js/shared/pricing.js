// Penentuan harga menu per outlet & channel — dipakai bersama kasir dan Worker.
(function (root) {
    /**
     * Harga satuan dasar menu (tanpa modifier).
     * menu: {price}, outletPrice: number|null, channel: {code, markup_pct}, channelPrice: number|null
     */
    function basePrice(menu, outletPrice, channel, channelPrice) {
        const base = outletPrice !== null && outletPrice !== undefined ? Number(outletPrice) : Number(menu.price);
        if (channelPrice !== null && channelPrice !== undefined) return Number(channelPrice);
        const m = channel && Number(channel.markup_pct) > 0 ? Number(channel.markup_pct) : 0;
        return m ? Math.ceil(base * (1 + m / 100) / 100) * 100 : base;
    }

    /** Harga satuan termasuk modifier terpilih: mods = [{price}] */
    function unitPrice(base, mods) {
        return base + (mods || []).reduce((s, m) => s + (Number(m.price) || 0), 0);
    }

    root.Pricing = { basePrice, unitPrice };
})(typeof globalThis !== 'undefined' ? globalThis : window);
