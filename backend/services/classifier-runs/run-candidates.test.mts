import { randomUUID } from 'node:crypto'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import {
  captureClassifierRunCandidatesForTest,
  captureClassifierRunStoryCandidatesForTest,
  getClassifierRunCandidateTopicIdsForTest,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import { reserveSyntheticRunId } from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-run'
import { mergeTopicForTest } from '@voucha/test-helpers/entities/topics/deletion'
import { describe, expect, it } from 'vitest'

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

    await captureClassifierRunCandidatesForTest(runId, [inactiveId, activeId])

    expect(await getClassifierRunCandidateTopicIdsForTest(runId)).toEqual([activeId])
  })

  it('refuses to capture more topics than the classifier ceiling', async () => {
    const runId = await reserveSyntheticRunId()
    const topicIds = Array.from({ length: 21 }, () => randomUUID())

    await expect(captureClassifierRunCandidatesForTest(runId, topicIds)).rejects.toThrow(
      'Classifier captured topics exceed its limit (20)',
    )
  })

  it('refuses to capture more stories than the classifier ceiling', async () => {
    const runId = await reserveSyntheticRunId()
    const candidates = Array.from({ length: 21 }, () => ({
      kind: 'story' as const,
      storyId: randomUUID(),
    }))

    await expect(captureClassifierRunStoryCandidatesForTest(runId, candidates)).rejects.toThrow(
      'Classifier captured stories exceed its limit (20)',
    )
  })
})
