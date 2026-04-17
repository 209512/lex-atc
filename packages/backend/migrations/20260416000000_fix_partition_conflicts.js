exports.up = async function(knex) {
  await knex.schema.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_event_logs_p0_correlation_id
    ON event_logs_p0 (correlation_id)
  `);

  await knex.schema.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_event_logs_p0_shard_seq
    ON event_logs_p0 (shard_id, shard_seq)
  `);

  await knex.schema.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_snapshots_p0_agent_uuid
    ON agent_snapshots_p0 (agent_uuid)
  `);
};

exports.down = async function(knex) {
  await knex.schema.raw(`DROP INDEX IF EXISTS uq_agent_snapshots_p0_agent_uuid`);
  await knex.schema.raw(`DROP INDEX IF EXISTS uq_event_logs_p0_shard_seq`);
  await knex.schema.raw(`DROP INDEX IF EXISTS uq_event_logs_p0_correlation_id`);
};
