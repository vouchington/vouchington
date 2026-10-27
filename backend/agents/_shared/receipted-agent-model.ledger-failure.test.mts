import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { getBackgroundResponseHooks } from '@modules/openai-utils/create-response'
import { modelRoutingConfig, OPENAI_TRANSPORT_FIELD } from '@services/ai-usage/model-routing-config'
import { getAccountingUncertaintySource } from '@services/ai-usage'
import { getAgentCallReceipt } from '@services/ai-usage/agent-call-receipts'
import {
  countAiUsageRecordsForResponseId,
  createTestUserDirect,
  insertTestPost,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { withReservedAiUsageDay } from '@voucha/test-helpers/with-reserved-ai-usage-day'
import {
  makeDirectOpenAIResult,
  TEST_OPENAI_SELECTION,
} from '@voucha/test-helpers/agents/model-call-result'
import { runWithBackgroundResponseJob } from './background-response-job-context.mts'
import { agentCallOperationKey, callReceiptedAgentModel } from './receipted-agent-model.mts'

async function ownedStoryPostId(): Promise<string> {
  const author = await createTestUserDirect()
  return insertTestPost({
    title: 'Owned story post receipt',
    slug: `story-receipt-${randomUUID()}`,
    createdById: author.id,
    markdown: '',
    postType: 'story',
  })
}

describe('paid agent receipt after a usage ledger failure', () => {
  it('keeps a successful result while its response waits for accounting recovery', async () => {
    await modelRoutingConfig.waitForInitialization()
    const restoreTransport = overrideDynamicConfigFieldsForTest(modelRoutingConfig, {
      [OPENAI_TRANSPORT_FIELD]: 'direct',
    })
    try {
      await withReservedAiUsageDay(1_000_000, async day => {
        const responseId = `resp_${randomUUID()}`
        const result = {
          ...makeDirectOpenAIResult(responseId, { input_tokens: 100, output_tokens: 20 }),
          output: { title: 'Already paid result' },
        }
        const registered: string[] = []
        const settle = vi.fn<(_: string) => Promise<void>>()
        const callModel = vi.fn<() => Promise<typeof result>>(async () => {
          const hooks = getBackgroundResponseHooks()
          if (!hooks) throw new Error('Background registration hook absent')
          await hooks.onResponseCreated(responseId)
          return result
        })
        const params = {
          agentSlug: 'story-post',
          operationId: randomUUID(),
          postId: await ownedStoryPostId(),
          promptVersion: 'story-post-test-v1',
          selection: TEST_OPENAI_SELECTION,
          input: 'Fixed story prompt',
          safetyIdentifier: responseId,
          communityId: randomUUID(), // Missing FK rejects the real usage INSERT.
          callModel,
        }
        const key = agentCallOperationKey(params.agentSlug, params.operationId)
        const first = () =>
          runWithBackgroundResponseJob(
            {
              register: async response => {
                registered.push(response.responseId)
              },
              settle,
            },
            () => callReceiptedAgentModel(params),
          )

        await expect(first()).resolves.toEqual(result)
        await expect(getAccountingUncertaintySource(day)).resolves.toBe('ledger_write_failed')
        await expect(countAiUsageRecordsForResponseId(responseId)).resolves.toBe(0)
        expect(registered).toEqual([responseId])
        expect(settle).not.toHaveBeenCalled()
        await expect(getAgentCallReceipt(key)).resolves.toMatchObject({
          result_ciphertext: expect.any(String),
        })
        await expect(first()).resolves.toEqual(result)
        expect(callModel).toHaveBeenCalledOnce()
      })
    } finally {
      restoreTransport()
    }
  })
})
