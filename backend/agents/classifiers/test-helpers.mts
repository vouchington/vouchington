import type {
  StructuredDecisionClient,
  StructuredDecisionRequest,
  StructuredDecisionResult,
} from '@modules/structured-decisions'
import type { ActiveClassifierConfiguration } from '@services/classifiers'
import { classifierPrompt } from './safe-content.mts'
import type { ClassifierContextPolicy, ExecuteClassifierDecisionInput } from './types.mts'

export const classifierId = '018f9f8e-7c49-7b88-8c4a-5f8a7d586e01'
export const promptVersionId = '018f9f8e-7c49-7b88-8c4a-5f8a7d586e02'
export const postId = '018f9f8e-7c49-7b88-8c4a-5f8a7d586e03'
export const rssFeedItemId = '018f9f8e-7c49-7b88-8c4a-5f8a7d586e04'
export const topicAId = '018f9f8e-7c49-7b88-8c4a-5f8a7d586e05'
export const topicBId = '018f9f8e-7c49-7b88-8c4a-5f8a7d586e06'
export const topicCId = '018f9f8e-7c49-7b88-8c4a-5f8a7d586e07'
export const storedCandidateAId = '018f9f8e-7c49-7b88-8c4a-5f8a7d586e08'
export const storyAId = '018f9f8e-7c49-7b88-8c4a-5f8a7d586e09'
export const storyBId = '018f9f8e-7c49-7b88-8c4a-5f8a7d586e0a'

export const configuration: ActiveClassifierConfiguration = {
  classifierId,
  primitive: 'noul',
  candidateKind: 'topic',
  promptVersionId,
  prompt: 'Classify this.',
  modelName: 'typesafe/jev-1.13',
  modelProvider: 'typesafe',
  defaultThresholds: { lower: 0.25, upper: 0.75 },
}

export const contextPolicy: ClassifierContextPolicy = {
  transport: 'typesafe',
  model: 'typesafe/jev-1.13',
  measure: request => ({
    totalTokens: request.questions.length * 10,
    stateAndLongestQuestionTokens: 10,
  }),
}

export function makeInput(
  overrides: Partial<ExecuteClassifierDecisionInput>,
): ExecuteClassifierDecisionInput {
  return {
    batchId: '018f9f8e-7c49-7b88-8c4a-5f8a7d586ef9',
    classifierId: configuration.classifierId,
    promptVersionId: configuration.promptVersionId,
    subject: { postId, rssFeedItemId: null },
    scope: { scopeCategory: 'global', scopeCommunityId: null },
    state: classifierPrompt`classify this post`,
    bindings: [
      {
        type: 'noul',
        questionId: 'candidate-a',
        question: classifierPrompt`Does topic a apply?`,
        candidate: {
          candidateKind: 'topic',
          topicId: topicAId,
          storedCandidateId: storedCandidateAId,
        },
      },
      {
        type: 'noul',
        questionId: 'candidate-b',
        question: classifierPrompt`Does topic b apply?`,
        candidate: { candidateKind: 'topic', topicId: topicBId, storedCandidateId: null },
      },
    ],
    contextPolicy,
    client: makeClient(() => {
      throw new Error('test client not configured')
    }),
    ...overrides,
  }
}

export function threeNoulBindings(): ExecuteClassifierDecisionInput['bindings'] {
  return [
    ...makeInput({}).bindings,
    {
      type: 'noul',
      questionId: 'candidate-c',
      question: classifierPrompt`Does topic c apply?`,
      candidate: { candidateKind: 'topic', topicId: topicCId, storedCandidateId: null },
    },
  ]
}

export function makeClient(
  decide: (request: StructuredDecisionRequest) => StructuredDecisionResult,
): StructuredDecisionClient & { requests: StructuredDecisionRequest[] } {
  const requests: StructuredDecisionRequest[] = []
  return {
    requests,
    decide: async request => {
      requests.push(request)
      return decide(request)
    },
  }
}

export function storyCandidate(storyId: string): {
  candidateKind: 'story'
  storyId: string
  storedCandidateId: null
} {
  return { candidateKind: 'story', storyId, storedCandidateId: null }
}
