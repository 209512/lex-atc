exports.up = async function(knex) {
  await knex.schema.raw(`
    ALTER TABLE channel_snapshots
      ADD COLUMN IF NOT EXISTS onchain_txid TEXT,
      ADD COLUMN IF NOT EXISTS onchain_status TEXT,
      ADD COLUMN IF NOT EXISTS onchain_commitment TEXT,
      ADD COLUMN IF NOT EXISTS onchain_confirmed_at TIMESTAMPTZ
  `);
};

exports.down = async function(knex) {
  await knex.schema.raw(`
    ALTER TABLE channel_snapshots
      DROP COLUMN IF EXISTS onchain_confirmed_at,
      DROP COLUMN IF EXISTS onchain_commitment,
      DROP COLUMN IF EXISTS onchain_status,
      DROP COLUMN IF EXISTS onchain_txid
  `);
};
