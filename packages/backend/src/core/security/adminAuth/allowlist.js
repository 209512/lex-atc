const parseSolanaAllowlist = () => {
    const raw = process.env.ADMIN_SOLANA_ALLOWLIST_JSON;
    if (!raw) return null;
    try {
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return null;
        const map = new Map();
        for (const item of arr) {
            const pubkey = String(item?.pubkey || item?.id || '');
            if (!pubkey) continue;
            const roles = Array.isArray(item?.roles) ? item.roles.map(String) : [];
            map.set(pubkey, roles);
        }
        return map;
    } catch {
        return null;
    }
};

module.exports = { parseSolanaAllowlist };

