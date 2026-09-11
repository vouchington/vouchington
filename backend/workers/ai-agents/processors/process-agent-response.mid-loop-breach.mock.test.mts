import { describe, it, expect, vi, beforeAll } from 'vitest'
import { processAgentResponse } from './process-agent-response.mts'
import type { PrivateUser } from '@services/users/types'
import { createTestUser } from '@voucha/test-helpers'
import { OpenAiSpendCapBreachError, type OpenAiSpendCapBreach } from '@services/ai-usage'
import { createAgentResponse } from '@services/agent-responses/create'
import { getAgentResponseById } from '@services/agent-responses/get'
import { makeJob } from './process-agent-response.test-helpers.mts'

vi.mock<typeof import('@modules/openai-utils/create-response')>(
  import('@modules/openai-utils/create-response'),
  async importOriginal => ({
    ...(await importOriginal()),
    createOpenAIResponse: vi.fn<VitestLooseMock>(),
    streamOpenAIResponse: vi.fn<VitestLooseMock>(async function* () {
      yield* []
      throw new Error('streamOpenAIResponse mock not configured for this test')
    }),
  }),
)

import { streamOpenAIResponse, type OpenAIResponse } from '@modules/openai-utils/create-response'

type ResponseStream = AsyncGenerator<{ delta: string }, OpenAIResponse>

describe('processAgentResponse spend-cap breach', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('releases the claim and rethrows instead of failing the response on a spend-cap breach', async () => {
    const agentResponse = await createAgentResponse({
      createdById: user.id,
      agent: 'research',
      input: { task: 'Task that breaches the spend cap' },
    })

    const breach: OpenAiSpendCapBreach = {
      reason: 'cap_exceeded',
      totalMicrounits: 10_000_000,
      dailyCapMicrounits: 10_000_000,
      day: '2026-03-01',
    }
    vi.mocked(streamOpenAIResponse).mockImplementationOnce(async function* (): ResponseStream {
      yield* []
      throw new OpenAiSpendCapBreachError(breach)
    })

    const job = makeJob(agentResponse.id)
    await expect(processAgentResponse(job)).rejects.toThrow(OpenAiSpendCapBreachError)

    const updated = await getAgentResponseById(agentResponse.id)
    expect(updated).toMatchObject({
      job_id: null,
      started_at: null,
      completed_at: null,
      failed_at: null,
    })
  }, 15_000)
})
