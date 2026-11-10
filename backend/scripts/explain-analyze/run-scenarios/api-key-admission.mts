import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { createApiKey } from '@services/api-keys/create'
import { rotateApiKey } from '@services/api-keys/rotate'
import { registerScenarioContract } from '../plan-expectations.mts'
import { seedUuid } from '../seed-data/common.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

/** Callback effects are asserted, then only the owned credentials are reset for plan replay. */
export async function runApiKeyAdmissionScenarios(): Promise<void> {
  process.env.API_KEY_CHECKSUM_SECRET ??= 'synthetic explain API key checksum secret'
  const noise = await write<{ id: string }>(
    `/* seedApiKeyAdmissionNoise */ INSERT INTO api_keys (user_id, prefix, key_hash, type)
     SELECT $1::uuid, 'explain-noise', sha256(($2 || n)::bytea), 'rss'
     FROM generate_series(1, 2000) n RETURNING id`,
    [seedUuid(19_992, '01'), crypto.randomUUID()],
  )
  const ids: string[] = noise.rows.map(row => row.id)
  await write('/* analyzeApiKeyAdmissionNoise */ ANALYZE api_keys')
  for (const scenario of ['api-key-create-owner-snapshot', 'api-key-rotate-owner-snapshot']) {
    registerScenarioContract(scenario, {
      allowEmptyResult: true,
      expectations: [
        { kind: 'maxProcessedRows', relation: 'users', max: 2 },
        { kind: 'maxProcessedRows', relation: 'api_keys', max: 4 },
      ],
    })
  }
  try {
    let createdId = ''
    await runAndCapture(
      'api-key-create-owner-snapshot',
      async () => {
        const created = await createApiKey(seedUser.id, 'rss', 'Explain owner', ['rss:read'])
        createdId = created.apiKey.id
        ids.push(createdId)
        assert.ok(created.rawKey)
      },
      undefined,
      'createApiKey',
      {
        afterCapture: async () => {
          await write('/* resetExplainCreatedApiKey */ DELETE FROM api_keys WHERE id = $1', [
            createdId,
          ])
        },
      },
    )
    const old = await createApiKey(seedUser.id, 'rss', 'Explain rotation', ['rss:read'])
    ids.push(old.apiKey.id)
    let replacementId = ''
    await runAndCapture(
      'api-key-rotate-owner-snapshot',
      async () => {
        const replacement = await rotateApiKey(seedUser.id, old.apiKey.id)
        replacementId = replacement.apiKey.id
        ids.push(replacementId)
        assert.notEqual(replacementId, old.apiKey.id)
      },
      undefined,
      'rotateApiKey',
      {
        afterCapture: async () => {
          await write(
            `/* resetExplainRotationSource */ UPDATE api_keys
          SET replaced_by_api_key_id = NULL, expires_at = $2 WHERE id = $1`,
            [old.apiKey.id, old.apiKey.expires_at],
          )
          await write('/* resetExplainRotationTarget */ DELETE FROM api_keys WHERE id = $1', [
            replacementId,
          ])
        },
      },
    )
  } finally {
    await write(
      '/* cleanupExplainApiKeyAdmission */ DELETE FROM api_keys WHERE id = ANY($1::uuid[])',
      [ids],
    )
    await write(
      '/* cleanupExplainApiKeyIdentities */ DELETE FROM retained_api_key_identities WHERE id = ANY($1::uuid[])',
      [ids],
    )
    await write(
      '/* vacuumExplainApiKeyAdmission */ VACUUM (ANALYZE) api_keys, retained_api_key_identities',
    )
  }
}
