import { createHash } from 'node:crypto'
import { createRandomString, createTestUser, insertTestCommunity } from '@voucha/test-helpers'
import { setPostClassifierToggleForTest } from '@voucha/test-helpers/entities/post-classifier-toggles'
import {
  POST_CLASSIFIER_PROMPT,
  POST_CLASSIFIER_REMOTE_QUESTIONS,
} from '@voucha/types/entities/post-classifier'
import { runConfigDrivenStatementsInTransaction } from '@data-stores/psql/migration-runner/config-driven-statements'
import generateSeedPostClassifierSQL from '@data-stores/psql/config-driven/0635-00-03-seed-post-classifier'
import {
  getPostClassifierSeedState,
  replacePostClassifierThreshold,
  rotatePostClassifierPrompt,
  setPostClassifierCandidateDeletedForTest,
  setPostClassifierLocalTopicDeletedForTest,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/seed'
import { acquirePostClassifierSeedTestLock } from '@voucha/test-helpers/data-stores/psql/post-classifier/seed-lock'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  getFreshAiGeneratedConfidenceThreshold,
  moderationConfig,
} from '@services/moderation/config'
import { resolvePostClassifierConfiguration } from './configuration.mts'

const detectorPackageVersion = 'test-resolved-package-version'

describe('current post classifier configuration (real PG and Valkey)', () => {
  let releaseSeedLock: (() => Promise<void>) | undefined
  beforeAll(async () => {
    releaseSeedLock = (await acquirePostClassifierSeedTestLock()).release
    await moderationConfig.waitForInitialization()
    await runConfigDrivenStatementsInTransaction(generateSeedPostClassifierSQL(), undefined)
  })
  afterAll(async () => releaseSeedLock?.())

  it('resolves baseline local-only without a provider credential and fingerprints package policy', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `c5-local-${createRandomString(8)}`,
    })
    const first = await resolvePostClassifierConfiguration(community.id, {
      detectorPackageVersion,
    })
    const repeated = await resolvePostClassifierConfiguration(community.id, {
      detectorPackageVersion,
    })
    expect(first).not.toBeNull()
    expect(repeated).toEqual(first)
    expect(first!.configuration.remote).toBeNull()
    expect(first!.configuration.local).toMatchObject({ detectorPackageVersion })
    expect(first!.configuration.local?.confidenceThreshold).toBe(
      Math.fround(await getFreshAiGeneratedConfidenceThreshold()),
    )
    expect(first!.configuration.local?.topicSlug).toBe('ai-generated')
    expect(first!.configuration.local?.topicId).toMatch(/^[0-9a-f-]{36}$/)
    expect(first!.configuration.enabledLabels.map(label => label.slug)).toEqual(['ai-generated'])
    expect(first!.configurationSha256.toString('hex')).toBe(
      createHash('sha256').update(first!.configurationJson).digest('hex'),
    )
    const versionChanged = await resolvePostClassifierConfiguration(community.id, {
      detectorPackageVersion: 'test-resolved-package-next',
    })
    expect(versionChanged?.configurationSha256).not.toEqual(first?.configurationSha256)
  })

  it('returns no work when the baseline label is disabled', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `c5-none-${createRandomString(8)}`,
    })
    await setPostClassifierToggleForTest(community.id, 'ai-generated', false)
    await expect(
      resolvePostClassifierConfiguration(community.id, { detectorPackageVersion }),
    ).resolves.toBeNull()
  })

  it('binds only enabled remote questions and changes identity with primary toggles', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `c5-remote-${createRandomString(8)}`,
    })
    const localOnly = await resolvePostClassifierConfiguration(community.id, {
      detectorPackageVersion,
    })
    await setPostClassifierToggleForTest(community.id, 'marketplace', true)
    const mixed = await resolvePostClassifierConfiguration(community.id, {
      detectorPackageVersion,
    })
    expect(mixed?.configurationSha256).not.toEqual(localOnly?.configurationSha256)
    expect(mixed?.configuration.remote?.questions.map(question => question.questionId)).toEqual(
      POST_CLASSIFIER_REMOTE_QUESTIONS.filter(q => q.logicalSlug === 'marketplace').map(
        q => q.questionId,
      ),
    )
    expect(mixed?.configuration.remote?.questions.every(question => question.thresholdId)).toBe(
      true,
    )
    expect(mixed?.configuration.remote?.prompt).toContain('Marketplace:')
  })

  it('fails closed if the local tag topic is inactive', async () => {
    try {
      await setPostClassifierLocalTopicDeletedForTest(true)
      await expect(
        resolvePostClassifierConfiguration(null, { detectorPackageVersion }),
      ).rejects.toThrow('local topic is missing or inactive')
    } finally {
      await setPostClassifierLocalTopicDeletedForTest(false)
    }
  })

  it('fingerprints the current candidate threshold revision and fails closed for a missing candidate', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `c5-revision-${createRandomString(8)}`,
    })
    await setPostClassifierToggleForTest(community.id, 'self-promotion', true)
    const before = await resolvePostClassifierConfiguration(community.id, {
      detectorPackageVersion,
    })
    const state = await getPostClassifierSeedState()
    const candidate = state.candidates.find(row => row.topicSlug === 'self-promotion')!
    try {
      await replacePostClassifierThreshold(
        candidate.candidateId,
        state.activePromptIds[0]!,
        0.31,
        0.81,
      )
      const changed = await resolvePostClassifierConfiguration(community.id, {
        detectorPackageVersion,
      })
      expect(changed?.configurationSha256).not.toEqual(before?.configurationSha256)
      expect(changed?.configuration.remote?.questions[0]).toMatchObject({
        lower: 0.31,
        upper: 0.81,
      })
      await setPostClassifierCandidateDeletedForTest(candidate.candidateId, true)
      await expect(
        resolvePostClassifierConfiguration(community.id, { detectorPackageVersion }),
      ).rejects.toThrow('candidate or threshold is missing')
    } finally {
      await setPostClassifierCandidateDeletedForTest(candidate.candidateId, false)
      await replacePostClassifierThreshold(
        candidate.candidateId,
        state.activePromptIds[0]!,
        0.25,
        0.75,
      )
    }
  })

  it('rejects prompt/model drift while allowing a valid staff-authored prompt revision', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `c5-prompt-${createRandomString(8)}`,
    })
    await setPostClassifierToggleForTest(community.id, 'self-promotion', true)
    const seed = generateSeedPostClassifierSQL()
    try {
      await rotatePostClassifierPrompt('mismatched policy')
      await expect(
        resolvePostClassifierConfiguration(community.id, { detectorPackageVersion }),
      ).rejects.toThrow('does not match the fixed catalog')
      await rotatePostClassifierPrompt(POST_CLASSIFIER_PROMPT, 'wrong-model')
      await expect(
        resolvePostClassifierConfiguration(community.id, { detectorPackageVersion }),
      ).rejects.toThrow('does not match the fixed catalog')
      await rotatePostClassifierPrompt(POST_CLASSIFIER_PROMPT)
      await expect(
        resolvePostClassifierConfiguration(community.id, { detectorPackageVersion }),
      ).resolves.not.toBeNull()
    } finally {
      await rotatePostClassifierPrompt('temporary cleanup prompt')
      await runConfigDrivenStatementsInTransaction(seed, undefined)
    }
  })
})
