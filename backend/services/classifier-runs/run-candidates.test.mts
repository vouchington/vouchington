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
import { classifierDecisionLimitsConfig } from '@services/classifiers/decision-result-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'

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

  it('refuses to capture more topics than the configured limit', async () => {
    const runId = await reserveSyntheticRunId()
    const restore = overrideDynamicConfigFieldsForTest(classifierDecisionLimitsConfig, {
      topic_candidates: 2,
    })
    try {
      await expect(
        captureClassifierRunCandidatesForTest(runId, [randomUUID(), randomUUID(), randomUUID()]),
      ).rejects.toThrow('Classifier captured topics exceed its limit (2)')
    } finally {
      restore()
    }
  })

  it('replays every stored topic after the configured limit is lowered', async () => {
    const creator = await createTestUser()
    const runId = await reserveSyntheticRunId()
    const topicIds = await Promise.all(
      Array.from({ length: 3 }, () => {
        const suffix = randomUUID().slice(0, 8)
        return insertTestTopic({
          name: `Replay ${suffix}`,
          slug: `replay-${suffix}`,
          createdById: creator.id,
        })
      }),
    )
    await captureClassifierRunCandidatesForTest(runId, topicIds)
    const restore = overrideDynamicConfigFieldsForTest(classifierDecisionLimitsConfig, {
      topic_candidates: 1,
    })
    try {
      expect(await getClassifierRunCandidateTopicIdsForTest(runId)).toHaveLength(3)
    } finally {
      restore()
    }
  })

  it('refuses to capture more stories than the configured limit', async () => {
    const runId = await reserveSyntheticRunId()
    const candidates = Array.from({ length: 3 }, () => ({
      kind: 'story' as const,
      storyId: randomUUID(),
    }))
    const restore = overrideDynamicConfigFieldsForTest(classifierDecisionLimitsConfig, {
      story_candidates: 2,
    })
    try {
      await expect(captureClassifierRunStoryCandidatesForTest(runId, candidates)).rejects.toThrow(
        'Classifier captured stories exceed its limit (2)',
      )
    } finally {
      restore()
    }
  })
})
