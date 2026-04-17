exports.up = async function(knex) {
  await knex.schema.raw(`
    ALTER TABLE channel_disputes
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT
  `);

  await knex.schema.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_disputes_idempotency_key
    ON channel_disputes (idempotency_key)
    WHERE idempotency_key IS NOT NULL
  `);
};

exports.down = async function(knex) {
  await knex.schema.raw(`DROP INDEX IF EXISTS uq_channel_disputes_idempotency_key`);
  await knex.schema.raw(`ALTER TABLE channel_disputes DROP COLUMN IF EXISTS idempotency_key`);
};
