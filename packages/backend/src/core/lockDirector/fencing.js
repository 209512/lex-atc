module.exports = function verifyFencingToken(director, shardId, token) {
    if (!shardId || !token) return false;
    if (director.atcService.state.globalStop || director.atcService.state.overrideSignal) return false;
    const shard = director.atcService.state.shards?.[shardId];
    if (!shard) return false;
    return String(shard.fencingToken) === String(token);
};

