class ExternalSideEffectGuard {
    assertAllowed(task) {
        if (!task) throw new Error('Missing task');
        if (task.status !== 'FINALIZED') {
            throw new Error('External side-effect blocked before finalization');
        }
        return true;
    }
}

module.exports = ExternalSideEffectGuard;

