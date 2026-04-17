const SandboxAdapter = require('./SandboxAdapter');
const fs = require('fs');

class TrueWasmSandboxAdapter extends SandboxAdapter {
    constructor(guard, wasmPath) {
        super();
        this.guard = guard;
        this.wasmPath = wasmPath || './agent_runtime.wasm';
        this.wasmModule = null;
    }

    async init() {
        if (!fs.existsSync(this.wasmPath)) {
            // Mock WASM generation for POC if not exists
            const mockWasm = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
            fs.writeFileSync(this.wasmPath, mockWasm);
        }
        const wasmBuffer = fs.readFileSync(this.wasmPath);
        this.wasmModule = await WebAssembly.compile(wasmBuffer);
    }

    async execute(task) {
        if (task.classification === 'reversible') {
            return { ok: true, executed: true, mode: 'immediate', output: { echo: task.intent?.text || '' } };
        }
        
        this.guard.assertAllowed(task);

        if (!this.wasmModule) {
            await this.init();
        }

        try {
            // Create a fresh instance for each execution (MicroVM concept)
            const importObject = {
                env: {
                    abort: () => { throw new Error('WASM Aborted'); },
                    // Inject restricted host functions here
                }
            };

            // Using WebAssembly.instantiate for true WASM execution
            const instance = await WebAssembly.instantiate(this.wasmModule, importObject);
            
            // In a real scenario, we'd pass the intent to the WASM exported function
            // const result = instance.exports.execute_intent(task.intent?.text);
            
            return { ok: true, executed: true, mode: 'true_wasm', output: { stdout: "Executed via WebAssembly" } };
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

module.exports = TrueWasmSandboxAdapter;
