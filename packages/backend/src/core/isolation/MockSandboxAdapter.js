const SandboxAdapter = require('./SandboxAdapter');

class MockSandboxAdapter extends SandboxAdapter {
    constructor(guard) {
        super();
        this.guard = guard;
    }

    async execute(task) {
        if (task.classification === 'reversible') {
            return { ok: true, executed: true, mode: 'immediate', output: { echo: task.intent?.text || '' } };
        }

        this.guard.assertAllowed(task);
        return { ok: true, executed: true, mode: 'finalized', output: { echo: task.intent?.text || '' } };
    }

    async compensate(task) {
        if (task.classification !== 'reversible') {
            return { ok: true, compensated: false };
        }
        return { ok: true, compensated: true };
    }
}

module.exports = MockSandboxAdapter;

