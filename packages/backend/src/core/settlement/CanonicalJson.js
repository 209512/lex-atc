const isPlainObject = (v) => Object.prototype.toString.call(v) === '[object Object]';

const normalize = (v) => {
    if (Array.isArray(v)) return v.map(normalize);
    if (isPlainObject(v)) {
        const out = {};
        const keys = Object.keys(v).sort();
        for (const k of keys) out[k] = normalize(v[k]);
        return out;
    }
    return v;
};

const canonicalStringify = (v) => JSON.stringify(normalize(v));

module.exports = { canonicalStringify };

