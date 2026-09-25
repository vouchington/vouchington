import { describe, expect, it } from 'vitest'
import type { ActiveClassifierConfiguration } from '@services/classifiers'
import { assertClassifierContextPolicy, requestFitsClassifierContext } from './context-policy.mts'
import { classifierChoiceKey, classifierPrompt } from './safe-content.mts'
import {
  configuration,
  makeInput,
  postId,
  rssFeedItemId,
  storedCandidateAId,
  storyAId,
} from './test-helpers.mts'
import type {
  ChoiceClassifierBinding,
  ExecuteClassifierDecisionInput,
  NoulClassifierBinding,
  TopicClassifierCandidate,
} from './types.mts'
import {
  assertBindingsMatchConfiguration,
  assertClassifierDecisionIds,
} from './validate-bindings.mts'

describe('classifier input validation', () => {
  it.each([
    [
      'classifier identity',
      { classifierId: '018f9f8e-7c49-7b88-8c4a-5f8a7d586e0b' },
      configuration,
    ],
    ['primitive', {}, { ...configuration, primitive: 'choice' as const }],
    ['transport', {}, { ...configuration, modelProvider: 'openrouter' as const }],
    ['model', {}, { ...configuration, modelName: 'other-model' }],
    ['state', { state: classifierPrompt`` }, configuration],
    ['bindings', { bindings: [] }, configuration],
  ])('rejects a mismatched %s', (_name, overrides, active) => {
    expect(() =>
      assertBindingsMatchConfiguration(
        makeInput(overrides),
        active as ActiveClassifierConfiguration,
      ),
    ).toThrow(/./)
  })

  it.each([
    ['no subject', { subject: { postId: null, rssFeedItemId: null } }],
    ['two subjects', { subject: { postId: makeInput({}).subject.postId, rssFeedItemId } }],
    [
      'global community',
      {
        scope: {
          scopeCategory: 'global' as const,
          scopeCommunityId: '018f9f8e-7c49-7b88-8c4a-5f8a7d586e0c',
        },
      },
    ],
    [
      'community without an ID',
      { scope: { scopeCategory: 'community_ai' as const, scopeCommunityId: null } },
    ],
  ])('rejects %s', (_name, overrides) => {
    expect(() =>
      assertBindingsMatchConfiguration(makeInput(overrides as never), configuration),
    ).toThrow(/./)
  })

  it('rejects a story classifier without an RSS subject', () => {
    const storyConfiguration: ActiveClassifierConfiguration = {
      ...configuration,
      primitive: 'choice',
      candidateKind: 'story',
    }
    const input = storyInput({
      subject: { postId, rssFeedItemId: null },
    })
    expect(() => assertBindingsMatchConfiguration(input, storyConfiguration)).toThrow(
      'RSS feed item',
    )
  })

  it('accepts a topic classifier decision on either a post or an RSS feed item subject', () => {
    expect(() =>
      assertBindingsMatchConfiguration(
        makeInput({ subject: { postId, rssFeedItemId: null } }),
        configuration,
      ),
    ).not.toThrow()
    expect(() =>
      assertBindingsMatchConfiguration(
        makeInput({ subject: { postId: null, rssFeedItemId } }),
        configuration,
      ),
    ).not.toThrow()
  })

  it.each([
    ['empty question ID', { questionId: ' ' }],
    ['empty question', { question: classifierPrompt`` }],
  ])('rejects bindings with %s', (_name, bindingOverride) => {
    const binding = { ...makeInput({}).bindings[0]!, ...bindingOverride }
    expect(() =>
      assertBindingsMatchConfiguration(makeInput({ bindings: [binding] as never }), configuration),
    ).toThrow(/./)
  })

  it('rejects mixed binding primitives', () => {
    const choice = storyInput({}).bindings[0]!
    expect(() =>
      assertBindingsMatchConfiguration(
        makeInput({ bindings: [makeInput({}).bindings[0]!, choice] }),
        configuration,
      ),
    ).toThrow('cannot mix question primitives')
  })

  it.each([
    ['question IDs', makeInput({}).bindings],
    [
      'concrete candidates',
      [
        makeInput({}).bindings[0]!,
        { ...makeInput({}).bindings[0]!, questionId: 'another-question' },
      ],
    ],
    [
      'stored candidates',
      [
        makeInput({}).bindings[0]!,
        {
          ...makeInput({}).bindings[1]!,
          candidate: {
            ...noulBinding(1).candidate,
            storedCandidateId: storedCandidateAId,
          },
        },
      ],
    ],
  ])('rejects duplicate %s', (_name, bindings) => {
    const duplicateQuestionBindings =
      _name === 'question IDs'
        ? [bindings[0]!, { ...bindings[1]!, questionId: bindings[0]!.questionId }]
        : bindings
    expect(() =>
      assertBindingsMatchConfiguration(
        makeInput({ bindings: duplicateQuestionBindings }),
        configuration,
      ),
    ).toThrow('duplicate')
  })

  it.each([
    [
      'candidate kind',
      { candidateKind: 'story' as const, storyId: storyAId, storedCandidateId: null },
    ],
    ['empty entity ID', { candidateKind: 'topic' as const, topicId: ' ', storedCandidateId: null }],
    [
      'empty stored ID',
      {
        candidateKind: 'topic' as const,
        topicId: (noulBinding(0).candidate as TopicClassifierCandidate).topicId,
        storedCandidateId: ' ',
      },
    ],
  ])('rejects an invalid %s', (_name, candidate) => {
    const binding = { ...makeInput({}).bindings[0]!, candidate }
    expect(() =>
      assertBindingsMatchConfiguration(makeInput({ bindings: [binding] }), configuration),
    ).toThrow(/./)
  })

  it('rejects a Choice binding with no candidate criterion', () => {
    const input = storyInput({
      bindings: [
        {
          ...choiceBinding(),
          criteria: [
            { criterion: classifierChoiceKey('none'), candidate: null },
            { criterion: classifierChoiceKey('other'), candidate: null },
          ],
        },
      ],
    })
    expect(() =>
      assertBindingsMatchConfiguration(input, {
        ...configuration,
        primitive: 'choice',
        candidateKind: 'story',
      }),
    ).toThrow('candidate criterion')
  })

  it('accepts and validates all durable IDs on a community story decision', () => {
    expect(() => assertClassifierDecisionIds(storyInput({}))).not.toThrow()
  })
})

describe('classifier context policy validation', () => {
  it('rejects an empty model and missing exact measurer', () => {
    expect(() =>
      assertClassifierContextPolicy({
        ...makeInput({}).contextPolicy,
        model: ' ',
      }),
    ).toThrow('requires a model')
    expect(() =>
      assertClassifierContextPolicy({
        ...makeInput({}).contextPolicy,
        measure: null as never,
      }),
    ).toThrow('exact request measurer')
  })

  it.each([Number.NaN, -1, 1.5])('rejects an invalid measured token count %s', totalTokens => {
    expect(() =>
      requestFitsClassifierContext(
        { state: 'state', questions: [] },
        {
          transport: 'openrouter',
          model: 'typesafe/jev-1.13',
          measure: () => ({ totalTokens }),
        },
      ),
    ).toThrow('invalid totalTokens')
  })
})

function storyInput(
  overrides: Partial<ExecuteClassifierDecisionInput>,
): ExecuteClassifierDecisionInput {
  return makeInput({
    subject: { postId: null, rssFeedItemId },
    scope: {
      scopeCategory: 'community_ai',
      scopeCommunityId: '018f9f8e-7c49-7b88-8c4a-5f8a7d586e0c',
    },
    bindings: [
      {
        type: 'choice',
        questionId: 'stories',
        question: classifierPrompt`Which story applies?`,
        criteria: [
          {
            criterion: classifierChoiceKey('story-a'),
            candidate: { candidateKind: 'story', storyId: storyAId, storedCandidateId: null },
          },
          { criterion: classifierChoiceKey('none'), candidate: null },
        ],
      },
    ],
    ...overrides,
  })
}

function noulBinding(index: number): NoulClassifierBinding {
  return makeInput({}).bindings[index] as NoulClassifierBinding
}

function choiceBinding(): ChoiceClassifierBinding {
  return storyInput({}).bindings[0] as ChoiceClassifierBinding
}
