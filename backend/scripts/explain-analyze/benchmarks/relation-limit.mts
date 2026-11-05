import { gracefulShutdown } from '@data-stores/graceful-shutdown'
import {
  disableQueryCapture,
  enableQueryCapture,
  beginTransaction,
  getCapturedQueries,
  write,
} from '@data-stores/psql'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import {
  getRelationLimitState,
  relationLimitsConfig,
  relationLimitsMaxValues,
} from '@services/entity-relations/relation-limits'
import { seedUuid } from '../seed-data/common.mts'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const SUBJECT_INDEX = 30_000
const TARGET_START_INDEX = SUBJECT_INDEX + 1
const TARGET_COUNT = 10_000
const INSERT_BATCH_SIZE = 500
const RELATION = getEntityRelationMetadataOrThrow({
  subjectType: 'user',
  predicate: 'follow',
  objectType: 'user',
})

/**
 * Measures the production capped-count query against 10,000 active follows in the configured
 * disposable development database. This standalone runner avoids changing the shared explain
 * seed's heavy-follow viewer, which is used by unrelated plan gates.
 */
async function main(): Promise<void> {
  const configuredLimit = getBoundedPositiveIntegerField(relationLimitsConfig, 'follow_user', {
    defaultValue: TARGET_COUNT,
    maxValue: relationLimitsMaxValues.follow_user,
  })
  if (configuredLimit !== TARGET_COUNT) {
    throw new Error(`Expected follow_user limit ${TARGET_COUNT}, received ${configuredLimit}`)
  }

  const subjectId = seedUuid(SUBJECT_INDEX, '01')
  const objectIds = Array.from({ length: TARGET_COUNT }, (_, index) =>
    seedUuid(TARGET_START_INDEX + index, '01'),
  )
  const userIds = [subjectId, ...objectIds]

  try {
    await cleanup(subjectId, userIds)
    await seedUsers(userIds)
    await seedFollows(subjectId, objectIds)
    // Unrelated subjects make the indexed predicate representative rather than nearly universal.
    for (const noiseSubjectId of objectIds.slice(0, 3)) {
      // no-mistakes-disable-next-line query-reached-per-item: fixed unrelated-subject corpus for the standalone scale measurement
      await seedFollows(
        noiseSubjectId,
        objectIds.filter(id => id !== noiseSubjectId),
      )
    }
    await write('/* analyzeRelationLimitFixture */ VACUUM (ANALYZE) relation__user__follow__user')

    enableQueryCapture()
    try {
      const state = await getRelationLimitState(RELATION, subjectId, [objectIds[0]!])
      if (!state || state.remaining !== 0 || state.existingObjectIds.length !== 1) {
        throw new Error('Expected 10,000 active follows to fill the configured relation limit')
      }
    } finally {
      disableQueryCapture()
    }

    const captured = getCapturedQueries().filter(query =>
      query.text.includes('/* getRelationLimitState */'),
    )
    if (captured.length !== 1) {
      throw new Error(`Expected one captured relation-limit query, received ${captured.length}`)
    }

    await using transaction = await beginTransaction()
    await transaction('/* explainRelationLimitSettings */ SET LOCAL jit = off')
    const { rows } = await transaction<{ 'QUERY PLAN': Array<Record<string, unknown>> }>(
      `/* explainRelationLimit */ EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON) ${captured[0]!.text}`,
      captured[0]!.values,
    )
    const plan = rows[0]!['QUERY PLAN'][0]!
    const planRoot = plan['Plan'] as Record<string, unknown>
    console.log(
      JSON.stringify(
        {
          name: 'getRelationLimitState:10k',
          activeRows: TARGET_COUNT,
          execution_time_ms: plan['Execution Time'],
          planning_time_ms: plan['Planning Time'],
          shared_hit_blocks: planRoot?.['Shared Hit Blocks'],
          shared_read_blocks: planRoot?.['Shared Read Blocks'],
          shared_dirtied_blocks: planRoot?.['Shared Dirtied Blocks'],
          shared_written_blocks: planRoot?.['Shared Written Blocks'],
          plan,
        },
        null,
        2,
      ),
    )
  } finally {
    try {
      await cleanup(subjectId, userIds)
    } finally {
      await gracefulShutdown()
    }
  }
}

async function seedUsers(userIds: readonly string[]): Promise<void> {
  for (let offset = 0; offset < userIds.length; offset += INSERT_BATCH_SIZE) {
    const batch = userIds.slice(offset, offset + INSERT_BATCH_SIZE)
    const values: unknown[] = []
    const rows: string[] = []
    for (const id of batch) {
      values.push(id, `relation-limit-benchmark-${id}`)
      const base = values.length - 1
      rows.push(`($${base}, $${base + 1})`)
    }
    // no-mistakes-disable-next-line query-reached-per-item: bounded bulk INSERT chunks seed the standalone scale scenario
    await write(
      `/* seedRelationLimitBenchmarkUsers */ INSERT INTO users (id, username)
       VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
      values,
    )
  }
}

async function seedFollows(subjectId: string, objectIds: readonly string[]): Promise<void> {
  for (let offset = 0; offset < objectIds.length; offset += INSERT_BATCH_SIZE) {
    const batch = objectIds.slice(offset, offset + INSERT_BATCH_SIZE)
    const values: unknown[] = []
    const rows: string[] = []
    for (const objectId of batch) {
      values.push(subjectId, objectId, subjectId)
      const base = values.length - 2
      rows.push(`($${base}, $${base + 1}, $${base + 2})`)
    }
    // no-mistakes-disable-next-line query-reached-per-item: bounded bulk INSERT chunks seed the standalone scale scenario
    await write(
      `/* seedRelationLimitBenchmarkFollows */ INSERT INTO relation__user__follow__user
       (subject_id, object_id, created_by_id) VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
      values,
    )
  }
}

async function cleanup(subjectId: string, userIds: readonly string[]): Promise<void> {
  await write(
    `/* cleanupRelationLimitBenchmarkFollows */ DELETE FROM relation__user__follow__user
     WHERE subject_id = $1`,
    [subjectId],
  )
  await write(
    `/* cleanupRelationLimitBenchmarkUsers */ DELETE FROM users
     WHERE id = ANY($1::uuid[]) AND username LIKE 'relation-limit-benchmark-%'`,
    [userIds],
  )
}

if (import.meta.main) {
  main().catch((err: unknown) => {
    console.error(err)
    process.exitCode = 1
  })
}
