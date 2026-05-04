const classifyText = (text) => {
    const t = String(text || '').toLowerCase();
    if (/(http|fetch|webhook|email|smtp|delete|drop|shutdown)/.test(t)) return 'external';
    if (/(payment|stripe|bank|transfer|mint|burn|settle|finalize|commit|irreversible)/.test(t)) return 'irreversible';
    return 'reversible';
};

module.exports = { classifyText };

