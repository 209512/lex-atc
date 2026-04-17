class SolanaSettlementAdapter {
    async submitSnapshot(_snapshot) {
        throw new Error('Not implemented');
    }

    async openDispute(_dispute) {
        throw new Error('Not implemented');
    }

    async slash(_slashing) {
        throw new Error('Not implemented');
    }
}

module.exports = SolanaSettlementAdapter;

