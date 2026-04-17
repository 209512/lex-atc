const SandboxAdapter = require('./SandboxAdapter');
const Docker = require('dockerode');

class DockerSandboxAdapter extends SandboxAdapter {
    constructor(guard) {
        super();
        this.guard = guard;
        this.docker = new Docker(); // Connects to local docker socket
        this.image = String(process.env.SANDBOX_DOCKER_IMAGE || 'alpine:3.20');
        this.execTimeoutMs = Math.max(1000, Number(process.env.SANDBOX_EXEC_TIMEOUT_MS || 5000));
        this._ensureImagePromise = null;
    }

    async execute(task) {
        if (task.classification === 'reversible') {
            return { ok: true, executed: true, mode: 'immediate', output: { echo: task.intent?.text || '' } };
        }

        this.guard.assertAllowed(task);

        let container;
        try {
            await this._ensureImage();
            const cmd = ['sh', '-lc', `echo ${JSON.stringify(String(task.intent?.text || 'empty'))}`];
            
            container = await this.docker.createContainer({
                Image: this.image,
                Cmd: cmd,
                HostConfig: {
                    NetworkMode: 'none', // Strictly isolate network
                    Memory: 64 * 1024 * 1024, // 64MB memory limit
                    NanoCpus: 1000000000, // 1 CPU
                    PidsLimit: 64,
                    ReadonlyRootfs: true,
                    CapDrop: ['ALL'],
                    SecurityOpt: ['no-new-privileges'],
                    AutoRemove: false
                }
            });

            await container.start();
            
            const stream = await container.logs({
                follow: true,
                stdout: true,
                stderr: true
            });

            let output = '';
            stream.on('data', chunk => {
                output += chunk.toString('utf8');
            });

            const data = await Promise.race([
                container.wait(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('SANDBOX_EXEC_TIMEOUT')), this.execTimeoutMs))
            ]);
            
            try { await container.remove({ force: true }); } catch (e) {
                const logger = require('../../utils/logger');
                logger.debug(`[DockerSandbox] Container removal error: ${e.message}`);
            }
            container = null;
            
            if (data.StatusCode !== 0) {
                return { ok: false, executed: false, error: `Container exited with code ${data.StatusCode}` };
            }

            return { ok: true, executed: true, mode: 'isolated_container', output: { stdout: output.trim() } };
        } catch (error) {
            if (container) {
                try { await container.remove({ force: true }); } catch (e) {
                    const logger = require('../../utils/logger');
                    logger.debug(`[DockerSandbox] Fallback container removal error: ${e.message}`);
                }
            }
            return { ok: false, executed: false, error: String(error?.message || error) };
        }
    }

    async _ensureImage() {
        if (this._ensureImagePromise) return this._ensureImagePromise;
        this._ensureImagePromise = (async () => {
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
        })();
        return this._ensureImagePromise;
    }

    async compensate(task) {
        if (task.classification !== 'reversible') {
            return { ok: true, compensated: false };
        }
        return { ok: true, compensated: true };
    }
}

module.exports = DockerSandboxAdapter;
