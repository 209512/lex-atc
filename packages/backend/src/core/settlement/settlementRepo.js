/** @typedef {import('./settlementRepo').SettlementRepo} SettlementRepo */

const getDefaultDb = () => require('../DatabaseManager');

/** @returns {SettlementRepo} */
const createSettlementRepo = (deps = {}) => {
    const source = deps.db || getDefaultDb();
    return {
        getDispute: (idempotencyKey) => source.getDispute(idempotencyKey),
        insertDispute: (row) => source.insertDispute(row),

        upsertChannel: (row) => source.upsertChannel(row),
        getChannel: (channelId) => source.getChannel(channelId),
        getChannelSnapshot: (channelId, nonce) => source.getChannelSnapshot(channelId, nonce),
        insertChannelSnapshot: (snapshot) => source.insertChannelSnapshot(snapshot),
        updateSnapshotOnchainStatus: (row) => source.updateSnapshotOnchainStatus(row),
    };
};

module.exports = { createSettlementRepo };
