import assert from 'node:assert/strict'
import { cleanupRetainedIdentityRoots } from '@services/data-retention/cleanup-retained-identities'
import { cleanupRetainedRelationIdentities } from '@services/data-retention/cleanup-retained-relation-identities'
import { cleanupExpiredOAuthAuthorizations } from '@services/data-retention/cleanup-oauth-authorizations'
import { write } from '@data-stores/psql'
import { seedUuid } from '../seed-data/common.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

/** The daily cleanup runs this after retained relations and media bindings. */
export async function runRetentionStagePageScenarios(): Promise<void> {
  await seedOAuthRetentionRows()
  await write(`/* seedExplainOAuthRetention:analyze */ ANALYZE oauth_authorizations`)
  registerScenarioContract('retention-expired-oauth-authorizations', {
    // DELETE without RETURNING reports zero root rows; the callback asserts the real write.
    allowEmptyResult: true,
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_oauth_authorizations__expiry'] },
      { kind: 'maxProcessedRows', relation: 'oauth_authorizations', max: 102 },
    ],
    seededRows: { oauth_authorizations: 10_003 },
  })
  await runAndCapture(
    'retention-expired-oauth-authorizations',
    async () => {
      const result = await cleanupExpiredOAuthAuthorizations({ batchSize: 50, maxBatches: 1 })
      assert.equal(result.deleted, 50, 'The seeded expiry page must delete 50 old rows')
    },
    undefined,
    'deleteExpiredOAuthAuthorizationBatch',
    { afterCapture: seedOAuthRetentionRows },
  )

  const orphanIds = Array.from({ length: 12 }, (_, index) => seedUuid(index, '1d'))
  const liveIds = Array.from({ length: 13 }, (_, index) => seedUuid(index, '01'))
  const scopedIds = [...orphanIds, ...liveIds]
  const restoreOrphans = () =>
    write(
      `/* seedExplainRetainedUserOrphans */
      INSERT INTO retained_user_identities (id)
      SELECT unnest($1::uuid[]) ON CONFLICT DO NOTHING`,
      [orphanIds],
    )
  await restoreOrphans()
  await write(`/* seedExplainRetainedUserOrphans:analyze */ ANALYZE retained_user_identities`)
  registerScenarioContract('retention-retained-user-identity-roots', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['retained_user_identities_pkey'], noSort: true },
      { kind: 'maxProcessedRows', relation: 'retained_user_identities', max: 25 },
    ],
    seededRows: { retained_user_identities: 20_012, users: 20_000 },
  })
  await runAndCapture(
    'retention-retained-user-identity-roots',
    async () => {
      const [result] = await cleanupRetainedIdentityRoots(25, { user: scopedIds })
      assert.equal(result?.scanned, 25)
      assert.equal(result?.deleted, 12, 'Unreferenced identity roots must be deleted')
      const { rows } = await write<{ orphan_count: string; live_count: string }>(
        `/* assertExplainRetainedUserRoots */
        SELECT count(*) FILTER (WHERE id = ANY($1::uuid[]))::text AS orphan_count,
          count(*) FILTER (WHERE id = ANY($2::uuid[]))::text AS live_count
        FROM retained_user_identities WHERE id = ANY($3::uuid[])`,
        [orphanIds, liveIds, scopedIds],
      )
      assert.equal(Number(rows[0]?.orphan_count), 0)
      assert.equal(Number(rows[0]?.live_count), 13)
    },
    undefined,
    'listRetainedIdentityCleanupCandidates:scoped',
    {
      afterCapture: async () => {
        await restoreOrphans()
      },
    },
  )

  await runRetainedRelationCleanupScenario()
}

async function runRetainedRelationCleanupScenario(): Promise<void> {
  const relationTable = 'relation__user__category__topic'
  const subjectId = seedUuid(0, '01')
  const relationIds = Array.from({ length: 25 }, (_, index) => seedUuid(index, '19'))
  const keys = relationIds.map(relationId => ({ subjectId, relationId }))
  const restoreRelations = () =>
    write(
      `/* seedExplainRetainedUserRelations */
      INSERT INTO retained_relation__user__category__topic (subject_id, id)
      SELECT $1::uuid, format('019e0000-1900-7000-8000-%s', lpad(to_hex(n), 12, '0'))::uuid
      FROM generate_series(0, 19999) AS n ON CONFLICT DO NOTHING`,
      [subjectId],
    )
  await restoreRelations()
  await write(
    `/* seedExplainRetainedUserRelations:requestUser */
    INSERT INTO retained_user_identities (id) VALUES ($1::uuid) ON CONFLICT DO NOTHING`,
    [seedUuid(0, '1f')],
  )
  await write(
    `/* seedExplainRetainedUserRelations:request */
    INSERT INTO user_deletion_requests (id, user_id) VALUES ($1::uuid, $2::uuid)
    ON CONFLICT (id) DO NOTHING`,
    [seedUuid(0, '1e'), seedUuid(0, '1f')],
  )
  await write(
    `/* seedExplainRetainedUserRelations:impact */
    INSERT INTO user_deletion_relation_impacts
      (id, request_id, subject_id, relation__user__category__topic_id)
    VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid) ON CONFLICT (id) DO NOTHING`,
    [seedUuid(1, '1e'), seedUuid(0, '1e'), subjectId, relationIds[0]],
  )
  await write(`/* seedExplainRetainedUserRelations:analyze */
    ANALYZE retained_relation__user__category__topic,
      user_deletion_relation_impacts, user_deletion_requests`)
  registerScenarioContract('retention-retained-user-relation-identities', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['retained_relation__user__category__topic_pkey'] },
      { kind: 'maxProcessedRows', relation: 'retained_relation__user__category__topic', max: 50 },
    ],
    seededRows: { retained_relation__user__category__topic: 20_000 },
  })
  await runAndCapture(
    'retention-retained-user-relation-identities',
    async () => {
      const [page] = await cleanupRetainedRelationIdentities(25, { [relationTable]: keys })
      assert.equal(page?.scanned, 25)
      assert.equal(page?.deleted, 24)
      const { rows } = await write<{ count: string; kept: string }>(
        `/* assertExplainRetainedUserRelations */
        SELECT count(*)::text AS count,
          count(*) FILTER (WHERE id = $2::uuid)::text AS kept
        FROM retained_relation__user__category__topic
        WHERE subject_id = $1::uuid AND id = ANY($3::uuid[])`,
        [subjectId, relationIds[0], relationIds],
      )
      assert.equal(Number(rows[0]?.count), 1)
      assert.equal(Number(rows[0]?.kept), 1)
    },
    undefined,
    'listRetainedRelationCleanupCandidates',
    {
      afterCapture: async () => {
        await restoreRelations()
      },
    },
  )
}

async function seedOAuthRetentionRows(): Promise<void> {
  await write(`/* seedExplainOAuthRetention */
    INSERT INTO oauth_authorizations
      (id, provider, purpose, callback_mode, initiating_device_id, initiating_session_id,
       redirect_uri, state_hash, pkce_verifier_ciphertext, expires_at)
    SELECT format('019e0000-d000-7000-8000-%s', lpad(n::text, 12, '0'))::uuid,
      'github', 'authenticate', 'web',
      format('019e0000-d100-7000-8000-%s', lpad(n::text, 12, '0'))::uuid,
      format('019e0000-d200-7000-8000-%s', lpad(n::text, 12, '0'))::uuid,
      'https://example.com/oauth/callback',
      encode(sha256(('explain-oauth-retention-' || n)::bytea), 'hex'),
      'seed-ciphertext',
      CASE WHEN n < 100 THEN NOW() - INTERVAL '1 day'
        ELSE NOW() + INTERVAL '1 day' END
    FROM generate_series(0, 9999) AS n ON CONFLICT (id) DO NOTHING`)
}
