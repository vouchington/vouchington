import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { getOpenAIResponseAttemptHooks } from '@modules/openai-utils/create-response'
import { spendCapConfig } from '@services/ai-usage/spend-cap-config'
import { getAgentCallReceipt } from '@services/ai-usage/agent-call-receipts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  makeModelCallResult,
  TEST_OPENAI_SELECTION,
} from '@voucha/test-helpers/agents/model-call-result'
import { agentCallOperationKey, callReceiptedAgentModel } from './receipted-agent-model.mts'

describe('paid agent receipt after a free-capacity retry is blocked', () => {
  it('releases the known-unbilled reservation so the job can resume after the cap clears', async () => {
    await spendCapConfig.waitForInitialization()
    const restoreAdmission = overrideDynamicConfigFieldsForTest(spendCapConfig, { enabled: false })
    const operationId = randomUUID()
    const params = {
      agentSlug: 'story-post',
      operationId,
      promptVersion: 'story-post-test-v1',
      selection: TEST_OPENAI_SELECTION,
      input: 'One fixed story prompt',
      safetyIdentifier: operationId,
    }
    try {
      await expect(
        callReceiptedAgentModel({
          ...params,
          callModel: async () => {
            const hooks = getOpenAIResponseAttemptHooks()
            if (!hooks) throw new Error('OpenAI attempt hooks missing')
            const restoreCap = overrideDynamicConfigFieldsForTest(spendCapConfig, {
              enabled: true,
              daily_cap_microunits: 0,
            })
            try {
              // The first physical attempt was a known-unbilled flex capacity rejection.
              await hooks.beforeAttempt({ attempt: 2, requestStartedAt: new Date() })
            } finally {
              restoreCap()
            }
            throw new Error('Spend cap should have blocked the resend')
          },
        }),
      ).rejects.toMatchObject({ name: 'SpendCapBreachError' })
      await expect(
        getAgentCallReceipt(agentCallOperationKey(params.agentSlug, operationId)),
      ).resolves.toBeUndefined()

      const output = { title: 'Allowed after cap clears', ai_summary_markdown: 'One summary.' }
      await expect(
        callReceiptedAgentModel({
          ...params,
          callModel: () => Promise.resolve(makeModelCallResult(output)),
        }),
      ).resolves.toMatchObject({ output })
    } finally {
      restoreAdmission()
    }
  })
})
