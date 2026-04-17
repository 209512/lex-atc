const { Queue, Worker } = require('bullmq');
const logger = require('../../utils/logger');
const db = require('../DatabaseManager');

class JobQueue {
    constructor() {
        this.queues = new Map();
        this.workers = new Map();
        this.redisConnection = null;
        this.isMemoryMode = true; // default true for tests without init()
        this.memoryQueues = new Map(); 
    }

    init(redisInstance, isMemoryMode = false) {
        if (process.env.NODE_ENV === 'test') {
            this.isMemoryMode = true;
        } else {
            this.isMemoryMode = isMemoryMode || !redisInstance || redisInstance.status !== 'ready';
        }
        this.redisConnection = redisInstance;
        logger.info(`[JobQueue] Initialized. MemoryMode: ${this.isMemoryMode}`);
    }

    get mode() {
        return process.env.NODE_ENV === 'test' || this.isMemoryMode;
    }

    registerQueue(queueName, processor) {
        if (this.mode) {
            this.memoryQueues.set(queueName, { processor });
            logger.info(`[JobQueue] Registered Memory queue: ${queueName}`);
            return;
        }

        try {
            const queue = new Queue(queueName, { connection: this.redisConnection });
            const worker = new Worker(queueName, processor, { connection: this.redisConnection });

            worker.on('failed', (job, err) => {
                logger.error(`[JobQueue] Job ${job.id} in ${queueName} failed: ${err.message}`);
            });
            worker.on('error', err => {
                logger.error(`[JobQueue] Worker error in ${queueName}: ${err.message}`);
            });

            this.queues.set(queueName, queue);
            this.workers.set(queueName, worker);
            logger.info(`[JobQueue] Registered Redis queue: ${queueName}`);
        } catch (err) {
            logger.error(`[JobQueue] Failed to register queue ${queueName}: ${err.message}`);
        }
    }

    async add(queueName, jobName, payload, options = {}) {
        const defaultOptions = { attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: true, removeOnFail: 100 };
        const finalOptions = { ...defaultOptions, ...options };

        if (this.mode) {
            const memQueue = this.memoryQueues.get(queueName);
            if (!memQueue) {
                logger.warn(`[JobQueue] Queue ${queueName} not found in memory mode.`);
                return null;
            }
            if (process.env.NODE_ENV === 'test') {
                try {
                    await memQueue.processor({ name: jobName, data: payload, id: `mem-${Date.now()}` });
                } catch (err) {
                    logger.error(`[JobQueue-Memory-Test] Task ${jobName} failed in ${queueName}: ${err.message}`);
                }
            } else {
                setImmediate(async () => {
                    try {
                        await memQueue.processor({ name: jobName, data: payload, id: `mem-${Date.now()}` });
                    } catch (err) {
                        logger.error(`[JobQueue-Memory] Task ${jobName} failed in ${queueName}: ${err.message}`);
                    }
                });
            }
            return { id: `mem-${Date.now()}` };
        }

        const queue = this.queues.get(queueName);
        if (!queue) {
            logger.warn(`[JobQueue] Queue ${queueName} not found.`);
            return null;
        }

        try {
            const job = await queue.add(jobName, payload, finalOptions);
            return job;
        } catch (err) {
            logger.error(`[JobQueue] Failed to add job ${jobName} to ${queueName}: ${err.message}`);
            return null;
        }
    }

    async stop() {
        for (const [name, worker] of this.workers.entries()) {
            try {
                await worker.close();
                logger.info(`[JobQueue] Closed worker for ${name}`);
            } catch (e) {
                logger.error(`[JobQueue] Error closing worker ${name}: ${e.message}`);
            }
        }
        for (const [name, queue] of this.queues.entries()) {
            try {
                await queue.close();
                logger.info(`[JobQueue] Closed queue ${name}`);
            } catch (e) {
                logger.error(`[JobQueue] Error closing queue ${name}: ${e.message}`);
            }
        }
        
        // Ensure any pending redis connections in bullmq are disconnected
        try {
            if (this.connection) {
                if (typeof this.connection.disconnect === 'function') {
                    this.connection.disconnect();
                } else if (typeof this.connection.quit === 'function') {
                    await this.connection.quit();
                }
            }
        } catch(e) {
            logger.error(`[JobQueue] Error disconnecting redis: ${e.message}`);
        }
    }
}

module.exports = new JobQueue();
