const SandboxAdapter = require('./SandboxAdapter');
const vm = require('vm');

class WasmSandboxAdapter extends SandboxAdapter {
    constructor(guard) {
        super();
        this.guard = guard;
    }

    async execute(task) {
        if (task.classification === 'reversible') {
            return { ok: true, executed: true, mode: 'immediate', output: { echo: task.intent?.text || '' } };
        }
        
        this.guard.assertAllowed(task);

        // Instead of starting a Docker container, we use a V8 Isolate (MicroVM concept)
        // to execute the intent in less than 1ms cold start.
        try {
            const context = {
                console: { log: () => {} }, // Muted
                Buffer: undefined,
                process: undefined,
                require: undefined,
                setTimeout: undefined,
                setInterval: undefined,
                setImmediate: undefined,
            };
            vm.createContext(context);

            const script = new vm.Script(`
                (() => {
                    const intent = ${JSON.stringify(task.intent?.text || 'empty')};
                    // Simulated Wasm/MicroVM payload execution
                    return "Executed: " + intent;
                })();
            `);

            const result = script.runInContext(context, {
                timeout: 50, // 50ms strict execution limit
                displayErrors: false
            });

            return { ok: true, executed: true, mode: 'isolate_v8', output: { stdout: result } };
        } catch (error) {
            return { ok: false, executed: false, error: error.message };
        }
    }

    async compensate(task) {
        if (task.classification !== 'reversible') {
            return { ok: true, compensated: false };
        }
        return { ok: true, compensated: true };
    }
}

module.exports = WasmSandboxAdapter;
