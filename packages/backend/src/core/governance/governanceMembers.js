const parseMembers = () => {
    const raw = process.env.GOVERNANCE_MEMBERS_JSON;
    if (!raw) return null;
    try {
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return null;
        const map = new Map();
        for (const m of arr) {
            const id = String(m?.id || '');
            if (!id) continue;
            const roles = Array.isArray(m?.roles) ? m.roles.map(String) : [];
            map.set(id, { id, roles });
        }
        return map;
    } catch {
        return null;
    }
};

const hasMember = (engine, adminId) => {
    if (!engine.members) return true;
    return engine.members.has(String(adminId));
};

module.exports = {
    parseMembers,
    hasMember,
};

