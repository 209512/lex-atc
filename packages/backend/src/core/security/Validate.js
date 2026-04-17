const isPlainObject = (v) => Object.prototype.toString.call(v) === '[object Object]';

// Recursively validate deep objects
const validateValue = (v, rule, keyPath) => {
    if (rule.required && (v === undefined || v === null)) {
        return { error: 'MISSING_FIELD', field: keyPath };
    }
    if (v === undefined || v === null) return null;

    const t = rule.type;
    if (t === 'string' && typeof v !== 'string') return { error: 'INVALID_FIELD', field: keyPath };
    if (t === 'number' && typeof v !== 'number') return { error: 'INVALID_FIELD', field: keyPath };
    if (t === 'boolean' && typeof v !== 'boolean') return { error: 'INVALID_FIELD', field: keyPath };
    if (t === 'array' && !Array.isArray(v)) return { error: 'INVALID_FIELD', field: keyPath };
    if (t === 'object' && !isPlainObject(v)) return { error: 'INVALID_FIELD', field: keyPath };

    if (rule.maxLen && typeof v === 'string' && v.length > rule.maxLen) {
        return { error: 'INVALID_FIELD', field: keyPath };
    }
    
    // Deep validation for object types
    if (t === 'object' && rule.schema && isPlainObject(v)) {
        for (const [subKey, subRule] of Object.entries(rule.schema)) {
            const err = validateValue(v[subKey], subRule, `${keyPath}.${subKey}`);
            if (err) return err;
        }
    }
    
    // Validate array items if itemSchema is provided
    if (t === 'array' && rule.itemSchema && Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) {
            const err = validateValue(v[i], rule.itemSchema, `${keyPath}[${i}]`);
            if (err) return err;
        }
    }

    return null;
};

const validateBody = (schema) => {
    return (req, res, next) => {
        if (!schema) return next();
        const body = req.body;
        if (!isPlainObject(body)) return res.status(400).json({ error: 'MALFORMED_BODY' });

        for (const [key, rule] of Object.entries(schema)) {
            const err = validateValue(body[key], rule, key);
            if (err) return res.status(400).json(err);
        }

        return next();
    };
};

module.exports = { validateBody };

