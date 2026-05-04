const getCookieValue = (req, name) => {
    const raw = String(req?.headers?.cookie || '');
    if (!raw) return null;
    const parts = raw.split(';');
    for (const p of parts) {
        const idx = p.indexOf('=');
        if (idx === -1) continue;
        const k = p.slice(0, idx).trim();
        if (k !== name) continue;
        const v = p.slice(idx + 1).trim();
        try {
            return decodeURIComponent(v);
        } catch {
            return v;
        }
    }
    return null;
};

module.exports = { getCookieValue };

