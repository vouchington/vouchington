import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { aiAgentsQueueConfig } from '../config.mts'
import { ai_agents } from '../queues.mts'
import {
  backgroundResponseRecoveryJobId,
  enqueueRecoverBackgroundResponse,
} from './recover-background-response.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('inline response recovery admission on real GlideMQ', () => {
  it('keeps the first saved response when admission repeats for the same provider id', async () => {
    const responseId = `resp_${randomUUID()}`
    const jobId = backgroundResponseRecoveryJobId(responseId)
    const response = {
      responseId,
      agentSlug: 'conversation-title',
      communityId: null,
      postId: null,
      createdAt: new Date().toISOString(),
    }
    try {
      await enqueueRecoverBackgroundResponse(response)
      await enqueueRecoverBackgroundResponse({ ...response, agentSlug: 'unexpected-replacement' })
      const job = await ai_agents.getJob(jobId)
      expect(job?.data.backgroundResponses).toEqual([response])
    } finally {
      const job = await ai_agents.getJob(jobId)
      if (job) await job.remove()
    }
  })

  it('uses the bounded operator lane cap at each admission', async () => {
    await aiAgentsQueueConfig.waitForInitialization()
    const jobs = []
    try {
      for (const [configuredCap, admittedCap] of [
        [3, 3],
        [4, 4],
        [0, 2],
        [9, 2],
      ]) {
        const restore = overrideDynamicConfigFieldsForTest(aiAgentsQueueConfig, {
          background_response_recovery_concurrency: configuredCap,
        })
        try {
          const responseId = `resp_${randomUUID()}`
          await enqueueRecoverBackgroundResponse({
            responseId,
            agentSlug: 'conversation-title',
            communityId: null,
            postId: null,
            createdAt: new Date().toISOString(),
          })
          const job = await ai_agents.getJob(backgroundResponseRecoveryJobId(responseId))
          expect(job?.opts.ordering).toEqual({
            key: 'ai_background_response_recovery',
            concurrency: admittedCap,
          })
          if (job) jobs.push(job)
        } finally {
          restore()
        }
      }
    } finally {
      await Promise.all(jobs.map(job => job.remove()))
    }
  })
})
