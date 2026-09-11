import { v7 as uuidv7 } from 'uuid'
import { describe, expect, it } from 'vitest'
import { enqueueAgentResponse, getAgentResponseJobId } from './agent-response.mts'

describe('enqueueAgentResponse', () => {
  it('enqueues an agent-response job with correct data and options', async () => {
    const agentResponseId = uuidv7()

    const job = await enqueueAgentResponse(agentResponseId)

    expect(job).toBeDefined()
    expect(job.data).toEqual({ agentResponseId })
    expect(job.name).toBe('agent-response')
    expect(job.id).toBe(getAgentResponseJobId(agentResponseId))
    expect(job.opts).toMatchObject({
      jobId: getAgentResponseJobId(agentResponseId),
      attempts: 1,
      removeOnComplete: expect.any(Number),
      removeOnFail: expect.any(Number),
      deduplication: {
        id: getAgentResponseJobId(agentResponseId),
        mode: 'simple',
      },
    })
  })
})
