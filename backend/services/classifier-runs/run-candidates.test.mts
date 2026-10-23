import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import { getClassifierRunCandidateTopicIdsForTest } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { reserveSyntheticRunId } from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-run'
import { mergeTopicForTest } from '@voucha/test-helpers/entities/topics/deletion'
import { describe, expect, it } from 'vitest'
import { insertClassifierRunCandidates } from './run-candidates.mts'

describe('classifier run candidate capture (real PG)', () => {
  it('does not capture a topic merged after candidate discovery', async () => {
    const runId = await reserveSyntheticRunId()
    const actor = await createTestUser()
    const suffix = randomUUID()
    const inactiveId = await insertTestTopic({
      name: `Inactive candidate ${suffix}`,
      slug: `inactive-candidate-${suffix}`,
      createdById: actor.id,
    })
    const activeId = await insertTestTopic({
      name: `Active candidate ${suffix}`,
      slug: `active-candidate-${suffix}`,
      createdById: actor.id,
    })
    await mergeTopicForTest(inactiveId, activeId, actor.id)

    await insertClassifierRunCandidates(write, runId, [inactiveId, activeId])

    expect(await getClassifierRunCandidateTopicIdsForTest(runId)).toEqual([activeId])
  })
})
