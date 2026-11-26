import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { getApiKeyByHash } from '@services/api-keys/get'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

const noiseCount = 6_000
const scenarios = [
  { name: 'api-key-hash-active', state: 'active' },
  { name: 'api-key-hash-expired', state: 'expired' },
  { name: 'api-key-hash-revoked', state: 'revoked' },
  { name: 'api-key-hash-missing', state: 'missing' },
] as const

export async function runApiKeyHashLookupScenarios(): Promise<void> {
  const noise = await write<{ id: string }>(
    `/* seedExplainApiKeyHashNoise */ INSERT INTO api_keys (user_id, prefix, key_hash, type, revoked_at, expires_at)
     SELECT $1::uuid, 'explain-hash', sha256(($2::text || n)::bytea), 'rss',
       CASE WHEN n % 4 = 0 THEN NOW() - INTERVAL '1 day' END,
       CASE WHEN n % 4 = 1 THEN NOW() - INTERVAL '1 day'
            WHEN n % 4 = 2 THEN NOW() + INTERVAL '30 days' END
     FROM generate_series(1, $3::integer) n RETURNING id`,
    [seedUuid(19_992, '01'), randomUUID(), noiseCount],
  )
  const ownedIds = noise.rows.map(row => row.id)
  try {
    assert.equal(noise.rowCount, noiseCount)
    const hashes = scenarios.map(() => randomBytes(32))
    const targets = await write<{ id: string; label: string }>(
      `/* seedExplainApiKeyHashTargets */ INSERT INTO api_keys (user_id, prefix, key_hash, type, label, revoked_at, expires_at)
       SELECT $1::uuid, 'explain-hash', fixture.key_hash, 'rss', fixture.state,
         CASE WHEN fixture.state = 'revoked' THEN NOW() - INTERVAL '1 day' END,
         CASE WHEN fixture.state = 'expired' THEN NOW() - INTERVAL '1 day' ELSE NOW() + INTERVAL '30 days' END
       FROM unnest($2::bytea[], $3::text[]) AS fixture(key_hash, state)
       WHERE fixture.state <> 'missing'
       RETURNING id, label`,
      [seedUser.id, hashes, scenarios.map(scenario => scenario.state)],
    )
    ownedIds.push(...targets.rows.map(row => row.id))
    assert.equal(targets.rowCount, scenarios.length - 1)
    const activeId = targets.rows.find(row => row.label === 'active')?.id
    assert.ok(activeId)
    await write('/* analyzeExplainApiKeyHash */ ANALYZE api_keys')

    for (const [index, { name, state }] of scenarios.entries()) {
      registerScenarioContract(name, {
        allowEmptyResult: state !== 'active',
        seededRows: { api_keys: ownedIds.length },
        expectations: [
          { kind: 'usesIndexes', indexes: ['idx_api_keys__key_hash'], noSort: true },
          { kind: 'maxProcessedRows', relation: 'api_keys', max: 1 },
        ],
      })
      await runAndCapture(
        name,
        async () => {
          const key = await getApiKeyByHash(hashes[index]!)
          if (state === 'active') assert.equal(key?.id, activeId)
          else assert.equal(key, null)
        },
        state,
        'getApiKeyByHash',
        { exactCapturedNames: ['getApiKeyByHash'] },
      )
    }
  } finally {
    await write('/* cleanupExplainApiKeyHash */ DELETE FROM api_keys WHERE id = ANY($1::uuid[])', [
      ownedIds,
    ])
    await write(
      '/* cleanupExplainApiKeyHashIdentities */ DELETE FROM retained_api_key_identities WHERE id = ANY($1::uuid[])',
      [ownedIds],
    )
    await write(
      '/* vacuumExplainApiKeyHash */ VACUUM (ANALYZE) api_keys, retained_api_key_identities',
    )
  }
}
