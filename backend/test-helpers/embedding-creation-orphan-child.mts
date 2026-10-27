import { embeddingCreationLeaseValkeyClient } from '@data-stores/valkey/clients'
import { acquireRenewableLease } from 'valkyries/lease'

const lease = await acquireRenewableLease('bedrock-embeddings:creation:lease', {
  ttlMs: 300_000,
  renewalIntervalMs: 10_000,
  client: embeddingCreationLeaseValkeyClient,
})
if (!lease) throw new Error('Owned orphan fixture could not acquire the creation lease')
// This subprocess represents a crashed holder: leave the application key, never release it.
process.stdout.write('acquired\n', () => process.exit(0))
