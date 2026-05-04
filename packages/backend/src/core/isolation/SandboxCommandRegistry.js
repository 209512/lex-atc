const { SandboxIntentSchema, SandboxArgsEchoSchema, SandboxArgsNoopSchema } = require('@lex-atc/shared');

const buildAllowedBinaries = () => new Set(
    String(process.env.SANDBOX_ALLOWED_BINARIES || '/bin/echo')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
);

const readPolicyOverrides = () => {
    const raw = process.env.SANDBOX_COMMAND_POLICY_JSON;
    if (!raw) return null;
    try {
        const obj = JSON.parse(raw);
        if (!obj || typeof obj !== 'object') return null;
        return obj;
    } catch {
        return null;
    }
};

const COMMAND_SPECS = {
    ECHO: {
        bin: '/bin/echo',
        argsSchema: SandboxArgsEchoSchema,
        allowedClassifications: ['external', 'irreversible'],
        requiredFinalized: true,
        requiredRoles: ['executor'],
        timeoutMs: 2000,
        auditRequired: true,
        buildArgs(intent) {
            if (Array.isArray(intent.args) && intent.args.length) return intent.args.map(String).slice(0, 1);
            return [String(intent.text || '')];
        }
    },
    NOOP: {
        bin: '/bin/true',
        argsSchema: SandboxArgsNoopSchema,
        allowedClassifications: ['external', 'irreversible'],
        requiredFinalized: true,
        requiredRoles: ['executor'],
        timeoutMs: 1000,
        auditRequired: true,
        buildArgs() {
            return [];
        }
    }
};

const hasRole = (roles, required) => {
    const set = new Set((roles || []).map(String));
    if (set.has('root')) return true;
    return (required || []).some(r => set.has(String(r)));
};

const resolveFromKey = (commandKey, intent, task, ctx) => {
    const key = String(commandKey || '').toUpperCase();
    let spec = COMMAND_SPECS[key];
    if (!spec) throw new Error('SANDBOX_COMMAND_KEY_NOT_ALLOWED');
    const overrides = readPolicyOverrides();
    const o = overrides?.[key];
    if (o && typeof o === 'object') {
        spec = {
            ...spec,
            allowedClassifications: Array.isArray(o.allowedClassifications) ? o.allowedClassifications.map(String) : spec.allowedClassifications,
            requiredRoles: Array.isArray(o.requiredRoles) ? o.requiredRoles.map(String) : spec.requiredRoles,
            timeoutMs: o.timeoutMs !== undefined && o.timeoutMs !== null ? Number(o.timeoutMs) : spec.timeoutMs,
            auditRequired: o.auditRequired !== undefined ? Boolean(o.auditRequired) : spec.auditRequired,
        };
    }
    const args = spec.buildArgs(intent);
    const parsed = spec.argsSchema.safeParse(args);
    if (!parsed.success) throw new Error('SANDBOX_ARGS_INVALID');
    if (task?.classification && Array.isArray(spec.allowedClassifications) && !spec.allowedClassifications.includes(String(task.classification))) {
        throw new Error('SANDBOX_CLASSIFICATION_NOT_ALLOWED');
    }
    if (spec.requiredFinalized && String(task?.status || '') !== 'FINALIZED') {
        throw new Error('SANDBOX_NOT_FINALIZED');
    }
    const roles = ctx?.roles || ctx?.executorRoles || null;
    if (spec.requiredRoles && spec.requiredRoles.length > 0) {
        if (!Array.isArray(roles)) throw new Error('SANDBOX_FORBIDDEN');
        if (!hasRole(roles, spec.requiredRoles)) throw new Error('SANDBOX_FORBIDDEN');
    }
    return { commandKey: key, bin: spec.bin, args, timeoutMs: spec.timeoutMs, auditRequired: Boolean(spec.auditRequired) };
};

const matchLegacyCommand = (cmd) => {
    const bin = String(cmd?.bin || '');
    const args = Array.isArray(cmd?.args) ? cmd.args.map(String) : [];
    for (const [key, spec] of Object.entries(COMMAND_SPECS)) {
        if (spec.bin !== bin) continue;
        try {
            const parsed = spec.argsSchema.safeParse(args);
            if (!parsed.success) throw new Error('SANDBOX_ARGS_INVALID');
            return { commandKey: key, args };
        } catch {
            continue;
        }
    }
    return null;
};

const resolveSandboxCommand = (task) => {
    const allowedBinaries = buildAllowedBinaries();
    const rawText = String(task?.intent?.text || '');
    const candidate = SandboxIntentSchema.safeParse(task?.intent || { text: rawText });
    const intent = candidate.success ? candidate.data : { text: rawText };

    let resolved;
    if (intent.commandKey) {
        resolved = resolveFromKey(intent.commandKey, intent, task, null);
    } else if (intent.command && intent.command.bin) {
        const legacy = matchLegacyCommand(intent.command);
        if (!legacy) throw new Error('SANDBOX_COMMAND_KEY_REQUIRED');
        resolved = resolveFromKey(legacy.commandKey, { text: rawText, args: legacy.args }, task, null);
    } else {
        resolved = resolveFromKey('ECHO', { text: String(intent.text || ''), args: [String(intent.text || '')] }, task, null);
    }

    if (!allowedBinaries.has(resolved.bin)) throw new Error('SANDBOX_BINARY_NOT_ALLOWED');
    return resolved;
};

const resolveSandboxCommandWithContext = (task, ctx) => {
    const rawText = String(task?.intent?.text || '');
    const candidate = SandboxIntentSchema.safeParse(task?.intent || { text: rawText });
    const intent = candidate.success ? candidate.data : { text: rawText };
    if (intent.commandKey) return resolveFromKey(intent.commandKey, intent, task, ctx);
    if (intent.command && intent.command.bin) {
        const legacy = matchLegacyCommand(intent.command);
        if (!legacy) throw new Error('SANDBOX_COMMAND_KEY_REQUIRED');
        return resolveFromKey(legacy.commandKey, { text: rawText, args: legacy.args }, task, ctx);
    }
    return resolveFromKey('ECHO', { text: String(intent.text || ''), args: [String(intent.text || '')] }, task, ctx);
};

module.exports = { resolveSandboxCommand, resolveSandboxCommandWithContext };
