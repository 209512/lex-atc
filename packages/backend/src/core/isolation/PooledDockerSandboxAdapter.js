const SandboxAdapter = require('./SandboxAdapter');
const Docker = require('dockerode');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class PooledDockerSandboxAdapter extends SandboxAdapter {
    constructor(guard, options = {}) {
        super();
        this.guard = guard;
        this.docker = new Docker();
        this.image = String(options.image || process.env.SANDBOX_DOCKER_IMAGE || 'alpine:3.20');
        this.poolSize = Math.max(1, Number(options.poolSize || process.env.SANDBOX_POOL_SIZE || 2));
        this.execTimeoutMs = Math.max(1000, Number(options.execTimeoutMs || process.env.SANDBOX_EXEC_TIMEOUT_MS || 5000));
        this.initPromise = null;
        this.available = [];
        this.busy = new Set();
        this.closed = false;
    }

    async init() {
        if (this.closed) return;
        if (this.initPromise) return this.initPromise;
        this.initPromise = (async () => {
            await this._ensureImage();
            await Promise.all(Array.from({ length: this.poolSize }, () => this._createAndStartWorker()));
        })();
        return this.initPromise;
    }

    async shutdown() {
        this.closed = true;
        const all = [...this.available, ...Array.from(this.busy)];
        this.available = [];
        this.busy.clear();
        await Promise.all(
            all.map(async (c) => {
                try { await c.remove({ force: true }); } catch (e) {
                    const logger = require('../../utils/logger');
                    logger.debug(`[PooledDocker] Container cleanup failed: ${e.message}`);
                }
            })
        );
    }

    async execute(task) {
        if (task.classification === 'reversible') {
            return { ok: true, executed: true, mode: 'immediate', output: { echo: task.intent?.text || '' } };
        }

        this.guard.assertAllowed(task);
        await this.init();
        const worker = await this._acquireWorker();
        try {
            const cmd = ['sh', '-lc', `echo ${JSON.stringify(String(task.intent?.text || ''))}`];
            const res = await this._exec(worker, cmd);
            return { ok: true, executed: true, mode: 'isolated_container_pool', output: res };
        } catch (error) {
            return { ok: false, executed: false, error: String(error?.message || error) };
        } finally {
            await this._releaseWorker(worker);
        }
    }

    async compensate(task) {
        if (task.classification !== 'reversible') {
            return { ok: true, compensated: false };
        }
        return { ok: true, compensated: true };
    }

    async _ensureImage() {
        try {
            await this.docker.getImage(this.image).inspect();
            return;
        } catch {}
        await new Promise((resolve, reject) => {
            this.docker.pull(this.image, (err, stream) => {
                if (err) return reject(err);
                this.docker.modem.followProgress(stream, (err2) => (err2 ? reject(err2) : resolve()));
            });
        });
    }

    async _createAndStartWorker() {
        const container = await this.docker.createContainer({
            Image: this.image,
            Cmd: ['sh', '-lc', 'while true; do sleep 3600; done'],
            HostConfig: {
                NetworkMode: 'none',
                Memory: 64 * 1024 * 1024,
                NanoCpus: 1000000000,
                PidsLimit: 64,
                ReadonlyRootfs: true,
                CapDrop: ['ALL'],
                SecurityOpt: ['no-new-privileges'],
                AutoRemove: false
            }
        });
        await container.start();
        this.available.push(container);
        return container;
    }

    async _acquireWorker() {
        const maxWaitMs = 1000;
        const startedAt = Date.now();
        while (!this.closed) {
            const c = this.available.pop();
            if (c) {
                this.busy.add(c);
                return c;
            }
            if (Date.now() - startedAt > maxWaitMs) {
                const fresh = await this._createAndStartWorker();
                this.available = this.available.filter((x) => x.id !== fresh.id);
                this.busy.add(fresh);
                return fresh;
            }
            await sleep(25);
        }
        throw new Error('SANDBOX_POOL_CLOSED');
    }

    async _releaseWorker(container) {
        if (!container) return;
        this.busy.delete(container);
        if (this.closed) {
            try { await container.remove({ force: true }); } catch {}
            return;
        }
        this.available.push(container);
    }

    async _exec(container, cmd) {
        const exec = await container.exec({
            Cmd: cmd,
            AttachStdout: true,
            AttachStderr: true
        });
        const stream = await exec.start({ hijack: true, stdin: false });
        let stdout = '';
        let stderr = '';
        stream.on('data', (chunk) => {
            const s = chunk.toString('utf8');
            stdout += s;
        });
        stream.on('error', (err) => {
            stderr += String(err?.message || err);
        });
        const waitRes = await Promise.race([
            exec.inspect(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('SANDBOX_EXEC_TIMEOUT')), this.execTimeoutMs))
        ]);
        if (waitRes?.ExitCode && waitRes.ExitCode !== 0) {
            throw new Error(`SANDBOX_EXEC_EXIT_${waitRes.ExitCode}${stderr ? `:${stderr}` : ''}`);
        }
        return { stdout: String(stdout || '').trim(), stderr: String(stderr || '').trim() };
    }
}

module.exports = PooledDockerSandboxAdapter;
