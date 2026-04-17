exports.up = async function(knex) {
  // We use PostgreSQL Range Partitioning on created_at for event_logs and agent_snapshots
  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS agent_snapshots (
      agent_uuid UUID,
      address TEXT,
      model TEXT,
      position JSONB,
      account JSONB NOT NULL,
      stats JSONB NOT NULL,
      snapshot_global_seq BIGINT NOT NULL DEFAULT 0,
      snapshot_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (agent_uuid, snapshot_created_at)
    ) PARTITION BY RANGE (snapshot_created_at)
  `);

  // Create initial partition for agent_snapshots
  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS agent_snapshots_p0 PARTITION OF agent_snapshots 
    FOR VALUES FROM (MINVALUE) TO (MAXVALUE)
  `);

  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS event_logs (
      id UUID,
      global_seq BIGINT NOT NULL,
      shard_id TEXT NOT NULL,
      shard_seq BIGINT NOT NULL,
      shard_epoch INTEGER NOT NULL,
      resource_id TEXT,
      fence_token TEXT,
      actor_uuid TEXT NOT NULL,
      action TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (id, created_at),
      UNIQUE (correlation_id, created_at),
      UNIQUE (shard_id, shard_seq, created_at)
    ) PARTITION BY RANGE (created_at)
  `);

  // Create initial partition for event_logs
  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS event_logs_p0 PARTITION OF event_logs 
    FOR VALUES FROM (MINVALUE) TO (MAXVALUE)
  `);

  await knex.schema.raw(`
    CREATE INDEX IF NOT EXISTS idx_event_logs_global_seq ON event_logs (global_seq)
  `);

  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS shard_checkpoints (
      shard_id TEXT PRIMARY KEY,
      last_shard_seq BIGINT NOT NULL DEFAULT -1,
      last_global_seq BIGINT NOT NULL DEFAULT -1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS system_checkpoints (
      key TEXT PRIMARY KEY,
      value BIGINT NOT NULL DEFAULT -1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await knex.schema.raw(`
    INSERT INTO system_checkpoints (key, value)
    VALUES ('snapshot_global_seq', -1)
    ON CONFLICT (key) DO NOTHING
  `);

  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS state_channels (
      channel_id TEXT PRIMARY KEY,
      agent_uuid TEXT NOT NULL,
      participant_agent TEXT NOT NULL,
      participant_treasury TEXT NOT NULL,
      last_nonce BIGINT NOT NULL DEFAULT -1,
      last_state_hash TEXT,
      dispute_window_ms INTEGER NOT NULL DEFAULT 60000,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS channel_snapshots (
      id UUID PRIMARY KEY,
      channel_id TEXT NOT NULL,
      nonce BIGINT NOT NULL,
      balances JSONB NOT NULL,
      state_hash TEXT NOT NULL,
      signatures JSONB NOT NULL,
      dispute_window_ms INTEGER NOT NULL,
      valid_until TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL,
      task_id TEXT,
      global_seq BIGINT NOT NULL,
      shard_id TEXT NOT NULL,
      shard_epoch INTEGER NOT NULL,
      resource_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (channel_id, nonce),
      UNIQUE (state_hash)
    )
  `);

  await knex.schema.raw(`
    CREATE INDEX IF NOT EXISTS idx_channel_snapshots_channel ON channel_snapshots (channel_id, nonce)
  `);

  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS channel_disputes (
      dispute_id UUID PRIMARY KEY,
      channel_id TEXT NOT NULL,
      opened_by TEXT NOT NULL,
      target_nonce BIGINT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    )
  `);
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('channel_disputes');
  await knex.schema.dropTableIfExists('channel_snapshots');
  await knex.schema.dropTableIfExists('state_channels');
  await knex.schema.dropTableIfExists('system_checkpoints');
  await knex.schema.dropTableIfExists('shard_checkpoints');
  await knex.schema.dropTableIfExists('event_logs');
  await knex.schema.dropTableIfExists('agent_snapshots');
};