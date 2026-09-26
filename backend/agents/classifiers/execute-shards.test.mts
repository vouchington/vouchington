import { describe, expect, it } from 'vitest'
import {
  classifierResultEntityId,
  type PersistClassifierDecisionInput,
} from '@services/classifiers'
import { executeClassifierDecision } from './execute.mts'
import {
  configuration,
  makeClient,
  makeInput,
  threeNoulBindings,
  topicAId,
  topicBId,
  topicCId,
} from './test-helpers.mts'
import type { ClassifierContextPolicy } from './types.mts'

const threeShardPolicy: ClassifierContextPolicy = {
  transport: 'openrouter',
  model: 'typesafe/jev-1.13',
  measure: request => ({ totalTokens: request.questions.length * 20_000 }),
}

describe('executeClassifierDecision shards', () => {
  it('persists one complete decision with consecutive calls after every shard succeeds', async () => {
    const persisted: PersistClassifierDecisionInput[] = []
    const client = makeClient(request => ({
      answers: request.questions.map(question => ({
        id: question.id,
        type: 'noul' as const,
        probability: 0.5,
        raw: { id: question.id, type: 'noul' },
      })),
      model: 'typesafe/jev-1.13',
      provider: 'TypeSafe',
      raw: {},
      usage: null,
    }))
    const input = makeInput({
      client,
      contextPolicy: threeShardPolicy,
      bindings: threeNoulBindings(),
    })

    await executeClassifierDecision(input, {
      getActiveClassifierConfiguration: async () => ({
        ...configuration,
        modelProvider: 'openrouter',
      }),
      persistClassifierDecision: async decision => {
        persisted.push(decision)
        return { decision: decision as never, replayed: false }
      },
    })

    expect(client.requests.map(request => request.questions.map(question => question.id))).toEqual([
      ['candidate-a'],
      ['candidate-b'],
      ['candidate-c'],
    ])
    expect(persisted).toHaveLength(1)
    expect(persisted[0]).toMatchObject({
      batchId: input.batchId,
      calls: [{ shardOrdinal: 0 }, { shardOrdinal: 1 }, { shardOrdinal: 2 }],
    })
    expect(
      persisted[0]?.calls
        .flatMap(call => call.results)
        .map(result => classifierResultEntityId(result)),
    ).toEqual([topicAId, topicBId, topicCId])
  })

  it('does not persist when a successful provider response omits a later shard answer', async () => {
    const persisted: PersistClassifierDecisionInput[] = []
    let callCount = 0
    const client = makeClient(request => {
      callCount += 1
      return {
        answers:
          callCount === 2
            ? []
            : request.questions.map(question => ({
                id: question.id,
                type: 'noul' as const,
                probability: 0.5,
                raw: { id: question.id, type: 'noul' },
              })),
        model: 'typesafe/jev-1.13',
        provider: 'TypeSafe',
        raw: {},
        usage: null,
      }
    })

    await expect(
      executeClassifierDecision(
        makeInput({
          client,
          contextPolicy: threeShardPolicy,
          bindings: threeNoulBindings(),
        }),
        {
          getActiveClassifierConfiguration: async () => ({
            ...configuration,
            modelProvider: 'openrouter',
          }),
          persistClassifierDecision: async decision => {
            persisted.push(decision)
            return { decision: decision as never, replayed: false }
          },
        },
      ),
    ).rejects.toThrow('did not cover every requested question')
    expect(client.requests).toHaveLength(2)
    expect(persisted).toEqual([])
  })
})
