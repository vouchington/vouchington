import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  POST_CLASSIFIER_ACTION_POLICY_REVISION,
  POST_CLASSIFIER_LABELS,
  POST_CLASSIFIER_MODEL_NAME,
  POST_CLASSIFIER_MODEL_PROVIDER,
  POST_CLASSIFIER_POLICY_PROMPT,
  POST_CLASSIFIER_PROMPT,
  POST_CLASSIFIER_REMOTE_QUESTIONS,
} from '@voucha/types/entities/post-classifier'
import { createPostModerationContent } from '@services/posts/content'
import { buildPostClassifierInput } from './classifier-input.mts'

function configuration(): Parameters<typeof buildPostClassifierInput>[1] {
  return {
    revision: 1,
    actorId: randomUUID(),
    detectorPackageVersion: '0.4.3',
    actionPolicyRevision: POST_CLASSIFIER_ACTION_POLICY_REVISION,
    enabledLabels: POST_CLASSIFIER_LABELS.filter(label => label.kind === 'remote').map(
      ({ slug, kind }) => ({ slug, kind }),
    ),
    local: null,
    remote: {
      classifierId: randomUUID(),
      promptVersionId: randomUUID(),
      prompt: POST_CLASSIFIER_PROMPT,
      modelName: POST_CLASSIFIER_MODEL_NAME,
      modelProvider: POST_CLASSIFIER_MODEL_PROVIDER,
      questions: POST_CLASSIFIER_REMOTE_QUESTIONS.map(question => ({
        ...question,
        topicId: randomUUID(),
        candidateId: randomUUID(),
        thresholdId: randomUUID(),
        lower: 0.25,
        upper: 0.75,
      })),
    },
  }
}

const post = () => ({
  id: randomUUID(),
  title: 'Travel rewards',
  markdown: 'Compare useful benefits.',
})

describe('post classifier remote input', () => {
  it('builds the full fixed set with exact lineage and one shared policy', async () => {
    const config = configuration()
    const subject = post()
    const input = (await buildPostClassifierInput(subject, config))!
    expect(input.bindings).toHaveLength(10)
    expect(input.bindings).toEqual(
      config.remote!.questions.map(question => ({
        type: 'noul',
        questionId: question.questionId,
        question: question.question,
        candidate: {
          candidateKind: 'topic',
          topicId: question.topicId,
          storedCandidateId: question.candidateId,
        },
      })),
    )
    expect(input.subject).toEqual({ postId: subject.id, rssFeedItemId: null })
    expect(input.scope).toEqual({ scopeCategory: 'global', scopeCommunityId: null })
    expect(input.inputSha256).toEqual(createPostModerationContent(subject).content_sha256)
    expect(input.state.split(POST_CLASSIFIER_POLICY_PROMPT)).toHaveLength(2)
    expect(input.state.startsWith(POST_CLASSIFIER_POLICY_PROMPT)).toBe(true)
    expect(input).not.toHaveProperty('contextPolicy')
    expect(input).not.toHaveProperty('client')
  })

  it('preserves a marketplace subset and includes ordered captions as wrapped external content', async () => {
    const config = configuration()
    config.remote!.questions = config.remote!.questions.filter(
      question => question.logicalSlug === 'marketplace',
    )
    config.enabledLabels = config.enabledLabels.filter(label => label.slug === 'marketplace')
    const subject = {
      ...post(),
      images: [
        { image_id: randomUUID(), order_index: 2, caption: 'Later caption' },
        { image_id: randomUUID(), order_index: 1, caption: 'Earlier caption' },
      ],
    }
    const input = (await buildPostClassifierInput(subject, config))!
    expect(input.bindings.map(binding => binding.questionId)).toEqual([
      'topic:buying',
      'topic:selling',
      'topic:trade',
      'topic:for-hire',
      'topic:hiring',
    ])
    expect(input.state).toContain('Earlier caption')
    expect(input.state.indexOf('Earlier caption')).toBeLessThan(
      input.state.indexOf('Later caption'),
    )
    expect(input.state).toContain(subject.title)
    expect(input.state).toContain(subject.markdown)
    expect(input.state).toContain(`Title: ${subject.title}`)
    expect(input.state).toContain(`Content:\n${subject.markdown}`)
    expect(input.state).not.toBe(
      `${POST_CLASSIFIER_POLICY_PROMPT}\n\n${subject.title}\n\n${subject.markdown}`,
    )
  })

  it('returns no remote input for local-only configuration, even for empty content', async () => {
    expect(
      await buildPostClassifierInput(
        { id: randomUUID(), title: '', markdown: '' },
        { ...configuration(), remote: null },
      ),
    ).toBeNull()
  })

  it('rejects duplicate, reordered, and partial enabled question sets', async () => {
    for (const mutation of ['duplicate', 'reordered', 'partial'] as const) {
      const config = configuration()
      const questions = config.remote!.questions
      if (mutation === 'duplicate') questions[1] = questions[0]!
      if (mutation === 'reordered') questions.reverse()
      if (mutation === 'partial') questions.pop()
      await expect(buildPostClassifierInput(post(), config)).rejects.toThrow(
        /fixed catalog|enabled set/,
      )
    }
  })

  it('rejects prompt or question drift and empty remote state', async () => {
    const config = configuration()
    config.remote!.prompt = 'unrecognized prompt'
    await expect(buildPostClassifierInput(post(), config)).rejects.toThrow('fixed prompt')
    config.remote!.prompt = POST_CLASSIFIER_PROMPT
    config.remote!.questions[0]!.question = config.remote!.questions[1]!.question
    await expect(buildPostClassifierInput(post(), config)).rejects.toThrow('fixed catalog')
    await expect(
      buildPostClassifierInput({ id: randomUUID(), title: ' ', markdown: '' }, configuration()),
    ).rejects.toThrow('nonempty post content')
  })
})
