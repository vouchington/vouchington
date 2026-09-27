import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  POST_CLASSIFIER_MODEL_NAME,
  POST_CLASSIFIER_POLICY_PROMPT,
  POST_CLASSIFIER_REMOTE_QUESTIONS,
  POST_CLASSIFIER_SLUG,
} from '@voucha/types/entities/post-classifier'
import { POST_CLASSIFIER_SYSTEM_USERNAME } from '@voucha/types/entities/user-constants'
import { runConfigDrivenStatementsInTransaction } from '../../migration-runner/config-driven-statements.mts'
import {
  getPostClassifierSeedState,
  replacePostClassifierThreshold,
  rotatePostClassifierPrompt,
} from '../../../../test-helpers/data-stores/psql/post-classifier/seed.mts'
import { getLocalTestUserRawByUsername } from '../../../../test-helpers/data-stores/psql/users.mts'
import { countLocalAgentsForSystemUsername } from '../../../../test-helpers/data-stores/psql/classifiers-seed.mts'
import generateSeedPostClassifierSQL from '../0635-00-03-seed-post-classifier.mts'
import { SEEDED_TOPICS } from '../0005-00-01-seed-topics.mts'
import { acquirePostClassifierSeedTestLock } from '../../../../test-helpers/data-stores/psql/post-classifier/seed-lock.mts'

describe('post classifier config-driven seed (real DB)', () => {
  let releaseSeedLock: (() => Promise<void>) | undefined
  beforeAll(async () => {
    releaseSeedLock = (await acquirePostClassifierSeedTestLock()).release
  })
  afterAll(async () => releaseSeedLock?.())
  it('runs after canonical topic seeding and keeps local AI out of remote candidates', () => {
    expect(SEEDED_TOPICS.map(topic => topic.slug)).toEqual(
      expect.arrayContaining(POST_CLASSIFIER_REMOTE_QUESTIONS.map(question => question.topicSlug)),
    )
    expect(POST_CLASSIFIER_REMOTE_QUESTIONS.map(question => question.topicSlug)).not.toContain(
      'ai-generated',
    )
  })

  it('converges to one system actor, active prompt, and ten independently bounded candidates', async () => {
    const statements = generateSeedPostClassifierSQL()
    await runConfigDrivenStatementsInTransaction(statements, undefined)
    const first = await getPostClassifierSeedState()
    await runConfigDrivenStatementsInTransaction(statements, undefined)
    const second = await getPostClassifierSeedState()

    expect(second).toEqual(first)
    expect(second.classifierSlug).toBe(POST_CLASSIFIER_SLUG)
    expect(second.modelName).toBe(POST_CLASSIFIER_MODEL_NAME)
    expect(second.activePromptIds).toHaveLength(1)
    expect(second.candidates.map(candidate => candidate.topicSlug)).toEqual(
      POST_CLASSIFIER_REMOTE_QUESTIONS.map(question => question.topicSlug),
    )
    expect(
      second.candidates.every(candidate => candidate.lower === 0.25 && candidate.upper === 0.75),
    ).toBe(true)
    expect(second.prompt).toContain(POST_CLASSIFIER_POLICY_PROMPT)
    let previousQuestionOffset = -1
    for (const question of POST_CLASSIFIER_REMOTE_QUESTIONS) {
      const offset = second.prompt?.indexOf(`${question.questionId}: ${question.question}`) ?? -1
      expect(offset).toBeGreaterThan(previousQuestionOffset)
      previousQuestionOffset = offset
    }
    expect((await getLocalTestUserRawByUsername(POST_CLASSIFIER_SYSTEM_USERNAME))?.is_system).toBe(
      true,
    )
    expect(await countLocalAgentsForSystemUsername(POST_CLASSIFIER_SYSTEM_USERNAME)).toBe(0)
  })

  it('keeps manual candidate bounds for an unchanged prompt and rotates prompt history', async () => {
    const statements = generateSeedPostClassifierSQL()
    await runConfigDrivenStatementsInTransaction(statements, undefined)
    const before = await getPostClassifierSeedState()
    const chosen = before.candidates[0]!
    try {
      await replacePostClassifierThreshold(chosen.candidateId, before.activePromptIds[0]!, 0.3, 0.8)
      await runConfigDrivenStatementsInTransaction(statements, undefined)
      const manual = await getPostClassifierSeedState()
      expect(manual.activePromptIds).toEqual(before.activePromptIds)
      expect(manual.candidates[0]).toMatchObject({ lower: 0.3, upper: 0.8 })
      expect(manual.candidates[0]?.thresholdId).not.toBe(chosen.thresholdId)
      expect(manual.candidates.slice(1)).toEqual(before.candidates.slice(1))

      await rotatePostClassifierPrompt('temporary test prompt')
      await runConfigDrivenStatementsInTransaction(statements, undefined)
      const restored = await getPostClassifierSeedState()
      expect(restored.activePromptIds).toHaveLength(1)
      expect(restored.activePromptIds[0]).not.toBe(before.activePromptIds[0])
      expect(restored.historicPromptIds).toContain(before.activePromptIds[0])
      expect(
        restored.candidates.every(
          candidate => candidate.lower === 0.25 && candidate.upper === 0.75,
        ),
      ).toBe(true)
    } finally {
      await rotatePostClassifierPrompt('temporary cleanup prompt')
      await runConfigDrivenStatementsInTransaction(statements, undefined)
    }
  })
})
