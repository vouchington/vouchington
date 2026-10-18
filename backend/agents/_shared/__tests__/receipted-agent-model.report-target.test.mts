import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUserDirect, insertTestPost } from '@voucha/test-helpers'
import { hardDeleteTestPost } from '@voucha/test-helpers/entities/posts-deletion'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { spendCapConfig } from '@services/ai-usage/spend-cap-config'
import { getAgentCallReceipt } from '@services/ai-usage/agent-call-receipts'
import {
  makeAgentModelCaller,
  TEST_OPENAI_SELECTION,
} from '@voucha/test-helpers/agents/model-call-result'
import { agentCallOperationKey, callReceiptedAgentModel } from '../receipted-agent-model.mts'

describe('report model receipt after target deletion', () => {
  it('cannot replay or dispatch again after deleting a completed receipt owner', async () => {
    const author = await createTestUserDirect()
    const postId = await insertTestPost({
      title: 'Receipt deletion boundary',
      slug: `receipt-${randomUUID()}`,
      createdById: author.id,
      markdown: 'Reported private context',
    })
    await spendCapConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(spendCapConfig, { enabled: false })
    const callModel = makeAgentModelCaller({ internal_response: 'Private report reasoning' })
    const params = {
      agentSlug: 'report-judgement',
      operationId: randomUUID(),
      reportTarget: { entityType: 'post' as const, entityId: postId },
      promptVersion: 'report-receipt-test',
      selection: TEST_OPENAI_SELECTION,
      input: 'Fixed reported context',
      safetyIdentifier: author.id,
      callModel,
    }
    const key = agentCallOperationKey(params.agentSlug, params.operationId)
    try {
      await expect(callReceiptedAgentModel(params)).resolves.toMatchObject({
        output: { internal_response: 'Private report reasoning' },
      })
      await hardDeleteTestPost(postId)
      await expect(getAgentCallReceipt(key)).resolves.toMatchObject({ result_ciphertext: 'erased' })
      await expect(callReceiptedAgentModel(params)).rejects.toMatchObject({
        name: 'UnrecoverableError',
      })
      expect(callModel).toHaveBeenCalledOnce()
    } finally {
      restore()
    }
  })
})
