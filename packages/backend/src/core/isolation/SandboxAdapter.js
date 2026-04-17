class SandboxAdapter {
    async execute(_task) {
        throw new Error('Not implemented');
    }

    async compensate(_task) {
        return { ok: true, compensated: false };
    }
}

module.exports = SandboxAdapter;

