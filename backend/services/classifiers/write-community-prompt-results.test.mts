import type { OwnedTransaction } from '@data-stores/psql'
import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { NormalizedClassifierDecisionInput } from './decision-input.mts'
import { insertCommunityPromptResults } from './write-community-prompt-results.mts'
import type { PersistedInputRow } from './write-decision-result-columns.mts'

type Query = (statement: {
  text: string
  values: unknown[]
}) => Promise<{ rowCount: number | null }>

const communityId = randomUUID()
const promptId = randomUUID()
const callId = randomUUID()

function inputFor(scope: NormalizedClassifierDecisionInput['scope']) {
  return {
    batchId: randomUUID(),
    classifierId: randomUUID(),
    promptVersionId: randomUUID(),
    subject: { postId: randomUUID(), rssFeedItemId: null },
    scope,
    calls: [],
  } satisfies NormalizedClassifierDecisionInput
}

const row: PersistedInputRow = {
  candidateId: null,
  decisionCallId: callId,
  entityId: promptId,
  probability: 0.9,
  rawResponse: '{"probability":0.9,"type":"noul"}',
  thresholdId: null,
  lowerThreshold: 0.25,
  upperThreshold: 0.75,
}

describe('insertCommunityPromptResults', () => {
  it('inserts the prompt, call and score columns under the batch scope', async () => {
    const query = vi.fn<Query>().mockResolvedValue({ rowCount: 1 })
    const input = inputFor({ scopeCategory: 'community_ai', scopeCommunityId: communityId })

    await expect(
      insertCommunityPromptResults(query as unknown as OwnedTransaction, input, [row]),
    ).resolves.toBe(1)

    const statement = query.mock.calls[0]![0] as { text: string; values: unknown[] }
    expect(statement.text).toContain('INSERT INTO community_prompt_classifier_results')
    expect(statement.text).not.toContain('candidate_id')
    expect(statement.text).not.toContain('threshold_id')
    expect(statement.values).toEqual(
      expect.arrayContaining([
        input.batchId,
        input.classifierId,
        input.promptVersionId,
        'community_ai',
        communityId,
        [promptId],
        [callId],
        [0.9],
        [0.25],
        [0.75],
      ]),
    )
  })

  it('counts no inserted rows when the driver reports none', async () => {
    const query = vi.fn<Query>().mockResolvedValue({ rowCount: null })

    await expect(
      insertCommunityPromptResults(
        query as unknown as OwnedTransaction,
        inputFor({ scopeCategory: 'community_ai', scopeCommunityId: communityId }),
        [],
      ),
    ).resolves.toBe(0)
  })

  it('refuses a global scope before writing anything', async () => {
    const query = vi.fn<Query>()

    await expect(
      insertCommunityPromptResults(
        query as unknown as OwnedTransaction,
        inputFor({ scopeCategory: 'global', scopeCommunityId: null }),
        [row],
      ),
    ).rejects.toThrow('Community prompt classifier results require a community scope')
    expect(query).not.toHaveBeenCalled()
  })
})
