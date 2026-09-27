import { describe, expect, it } from 'vitest'
import {
  POST_CLASSIFIER_ACTION_POLICY_REVISION,
  POST_CLASSIFIER_LABELS,
  POST_CLASSIFIER_LOCAL_POLICY_REVISION,
  POST_CLASSIFIER_MODEL_NAME,
  POST_CLASSIFIER_MODEL_PROVIDER,
  POST_CLASSIFIER_POLICY_PROMPT,
  POST_CLASSIFIER_REMOTE_QUESTIONS,
  POST_CLASSIFIER_SLUG,
} from '@voucha/types/entities/post-classifier'
import { MODERATOR_CONFIGS } from '@voucha/types/entities/moderator-configs'
import {
  clickBaitPolicy,
  marketplacePolicy,
  politicsAversePolicy,
  selfPromotionPolicy,
  shitPostPolicy,
  vaguePostPolicy,
} from '@voucha/types/entities/moderator-prompts'
import { POST_CLASSIFIER_SYSTEM_USERNAME } from '@voucha/types/entities/user-constants'

describe('fixed global post classifier catalog', () => {
  it('maps the seven existing logical toggles to exact classification topics', () => {
    expect(
      POST_CLASSIFIER_LABELS.map(label => ({
        slug: label.slug,
        kind: label.kind,
        topics:
          label.kind === 'remote' ? label.candidates.map(c => c.topicSlug) : [label.topicSlug],
      })),
    ).toEqual([
      {
        slug: 'self-promotion',
        kind: 'remote',
        topics: ['self-promotion'],
      },
      {
        slug: 'marketplace',
        kind: 'remote',
        topics: ['buying', 'selling', 'trade', 'for-hire', 'hiring'],
      },
      { slug: 'ai-generated', kind: 'local', topics: ['ai-generated'] },
      { slug: 'politics-averse', kind: 'remote', topics: ['political'] },
      { slug: 'click-bait', kind: 'remote', topics: ['click-bait'] },
      { slug: 'vague-post', kind: 'remote', topics: ['vague-post'] },
      { slug: 'shit-post', kind: 'remote', topics: ['shit-post'] },
    ])
    expect(POST_CLASSIFIER_LABELS.map(label => label.slug)).toEqual(
      MODERATOR_CONFIGS.map(config => config.slug),
    )
    expect(MODERATOR_CONFIGS.filter(config => config.baseline).map(config => config.slug)).toEqual([
      'ai-generated',
    ])
  })

  it('keeps exactly ten unique remote Noul questions and no local-AI question', () => {
    expect(POST_CLASSIFIER_REMOTE_QUESTIONS.map(q => q.questionId)).toEqual([
      'topic:self-promotion',
      'topic:buying',
      'topic:selling',
      'topic:trade',
      'topic:for-hire',
      'topic:hiring',
      'topic:political',
      'topic:click-bait',
      'topic:vague-post',
      'topic:shit-post',
    ])
    expect(POST_CLASSIFIER_REMOTE_QUESTIONS.map(q => q.topicSlug)).toEqual([
      'self-promotion',
      'buying',
      'selling',
      'trade',
      'for-hire',
      'hiring',
      'political',
      'click-bait',
      'vague-post',
      'shit-post',
    ])
    expect(new Set(POST_CLASSIFIER_REMOTE_QUESTIONS.map(q => q.questionId)).size).toBe(10)
    expect(POST_CLASSIFIER_REMOTE_QUESTIONS.every(q => q.question.endsWith('?'))).toBe(true)
    expect(POST_CLASSIFIER_REMOTE_QUESTIONS).not.toContainEqual(
      expect.objectContaining({ topicSlug: 'ai-generated' }),
    )
  })

  it('reuses one canonical policy body per hosted label and fixes execution identity', () => {
    for (const policy of [
      selfPromotionPolicy,
      marketplacePolicy,
      politicsAversePolicy,
      clickBaitPolicy,
      vaguePostPolicy,
      shitPostPolicy,
    ]) {
      expect(POST_CLASSIFIER_POLICY_PROMPT.split(policy)).toHaveLength(2)
    }
    expect(POST_CLASSIFIER_POLICY_PROMPT).not.toContain('Respond with:')
    expect(POST_CLASSIFIER_SLUG).toBe('post-classifier')
    expect(POST_CLASSIFIER_SYSTEM_USERNAME).toBe(POST_CLASSIFIER_SLUG)
    expect(POST_CLASSIFIER_MODEL_NAME).toBe('typesafe/jev-1.13')
    expect(POST_CLASSIFIER_MODEL_PROVIDER).toBe('openrouter')
    expect(POST_CLASSIFIER_ACTION_POLICY_REVISION).toBe('1')
    expect(POST_CLASSIFIER_LOCAL_POLICY_REVISION).toBe('1')
  })
})
