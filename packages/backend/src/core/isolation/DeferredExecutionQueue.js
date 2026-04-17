class DeferredExecutionQueue {
    constructor({ now = () => Date.now() } = {}) {
        this.now = now;
        this.tasks = new Map();
    }

    add(task) {
        this.tasks.set(task.taskId, task);
        return task;
    }

    get(taskId) {
        return this.tasks.get(taskId) || null;
    }

    remove(taskId) {
        this.tasks.delete(taskId);
    }

    list() {
        return Array.from(this.tasks.values());
    }

    due(timeoutMs) {
        const now = this.now();
        return this.list().filter(t => {
            if (t.status !== 'PENDING') return false;
            if (typeof t.timeoutAt === 'number') return now >= t.timeoutAt;
            return now - t.createdAt >= timeoutMs;
        });
    }
}

module.exports = DeferredExecutionQueue;
