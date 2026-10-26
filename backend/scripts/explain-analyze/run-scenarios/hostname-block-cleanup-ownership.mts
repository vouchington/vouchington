import { beginTransaction, write } from '@data-stores/psql'
import {
  getPendingDescendantCleanupRootHostnames,
  lockPendingAncestorHostnameBlockCleanup,
} from '@services/hostname-blocking/cleanup-operation-ancestor'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { SEEDED_ROWS_BY_RELATION } from '../plan-seeded-rows.mts'
import { runAndCapture } from '../run-support.mts'

const PENDING_CLEANUP_ROOT_NOISE_COUNT = 1_000

export async function runHostnameBlockOwnershipLookupScenarios(): Promise<void> {
  const fixture = await prepareHostnameCleanupOwnershipFixture()
  const seededRows = {
    url_hostnames: SEEDED_ROWS_BY_RELATION.url_hostnames + PENDING_CLEANUP_ROOT_NOISE_COUNT + 3,
    url_hostname_blocks:
      SEEDED_ROWS_BY_RELATION.url_hostname_blocks + PENDING_CLEANUP_ROOT_NOISE_COUNT + 2,
  }
  registerScenarioContract('hostname-block-pending-ancestor-owner', {
    seededRows,
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['url_hostnames_hostname_key', 'idx_url_hostnames__hostname__text_pattern_ops'],
        anyOf: true,
      },
      { kind: 'usesIndexes', indexes: ['idx_url_hostname_blocks__url_hostname_id'] },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 32 },
      { kind: 'maxProcessedRows', relation: 'url_hostname_blocks', max: 32 },
    ],
  })
  await runAndCapture(
    'hostname-block-pending-ancestor-owner',
    async () => {
      await using query = await beginTransaction()
      await lockPendingAncestorHostnameBlockCleanup(query, fixture.leafHostname)
    },
    undefined,
    'lockPendingAncestorHostnameBlockCleanup',
  )
  registerScenarioContract('hostname-block-pending-descendant-scopes', {
    seededRows,
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: [
          'idx_url_hostnames__reversed_hostname__text_pattern_ops',
          'idx_url_hostname_blocks__url_hostname_id',
        ],
      },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 64 },
      { kind: 'maxProcessedRows', relation: 'url_hostname_blocks', max: 64 },
    ],
  })
  await runAndCapture(
    'hostname-block-pending-descendant-scopes',
    async () => {
      await using query = await beginTransaction()
      await getPendingDescendantCleanupRootHostnames(
        query,
        crypto.randomUUID(),
        Array.from({ length: 25 }, (_, index) => `${fixture.deepReversed}.leaf-${index}`),
      )
    },
    undefined,
    'getPendingDescendantCleanupRootHostnames',
  )
}

async function prepareHostnameCleanupOwnershipFixture() {
  const suffix = crypto.randomUUID()
  const topHostname = `cleanup-plan-${suffix}.example.test`
  const broadHostname = `broad.${topHostname}`
  const deepHostname = `deep.${broadHostname}`
  const leafHostname = `leaf.${deepHostname}`
  const noiseSuffix = `-${suffix}.example.test`
  await using query = await beginTransaction()
  await query(sql`/* prepareHostnameCleanupOwnershipFixture:hostnames */
    INSERT INTO url_hostnames (hostname, publicly_introduced_at)
    SELECT 'cleanup-plan-noise-' || ordinal || ${noiseSuffix}, CURRENT_TIMESTAMP
    FROM generate_series(1, ${PENDING_CLEANUP_ROOT_NOISE_COUNT}) ordinal
    UNION ALL VALUES
      (${broadHostname}, CURRENT_TIMESTAMP),
      (${deepHostname}, CURRENT_TIMESTAMP),
      (${leafHostname}, CURRENT_TIMESTAMP)
  `)
  await query(sql`/* prepareHostnameCleanupOwnershipFixture:roots */
    WITH roots AS MATERIALIZED (
      SELECT uuidv7() AS id, hostname.id AS hostname_id
      FROM url_hostnames hostname
      WHERE hostname.hostname LIKE ${`cleanup-plan-noise-%${noiseSuffix}`}
        OR hostname.hostname = ANY(${[broadHostname, deepHostname]}::text[])
    )
    INSERT INTO url_hostname_blocks (
      id, url_hostname_id, relation_cleanup_root_block_id,
      relation_cleanup_blocked_hostname_count
    )
    SELECT id, hostname_id, id, 1 FROM roots
  `)
  await query.commit()
  await write(`/* prepareHostnameCleanupOwnershipFixture:analyze */
    ANALYZE url_hostnames, url_hostname_blocks`)
  return {
    leafHostname,
    deepReversed: deepHostname.split('.').toReversed().join('.'),
  }
}
