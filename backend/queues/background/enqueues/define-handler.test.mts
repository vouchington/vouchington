import type { Job } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import {
  backgroundContinuationHandler,
  backgroundDataHandler,
  backgroundSweepHandler,
} from './define-handler.mts'
import { SES_INBOUND_PROCESS_JOB } from './ses-inbound-jobs.mts'

const payload = { sesMessageId: 'ses-1', objectKey: 'copyright-incoming/ses-1' }
const queued = { data: payload } as Job<typeof payload>

describe('background handler helpers', () => {
  it('hands only the payload to a data processor and returns its result', async () => {
    const received: unknown[][] = []
    const handler = backgroundDataHandler(SES_INBOUND_PROCESS_JOB, (...args: unknown[]) => {
      received.push(args)
      return Promise.resolve('done')
    })

    await expect(handler.handle(queued)).resolves.toBe('done')

    expect(handler.job).toBe(SES_INBOUND_PROCESS_JOB)
    expect(received).toEqual([[payload]])
  })

  it('hands a sweep empty dependencies and the continuation payload', async () => {
    const received: unknown[][] = []
    const handler = backgroundContinuationHandler(SES_INBOUND_PROCESS_JOB, (...args: unknown[]) => {
      received.push(args)
      return Promise.resolve('continued')
    })

    await expect(handler.handle(queued)).resolves.toBe('continued')

    expect(received).toEqual([[{}, payload]])
  })

  it('calls a sweep processor with no arguments so the job never fills its dependencies', async () => {
    const received: unknown[][] = []
    const handler = backgroundSweepHandler(SES_INBOUND_PROCESS_JOB, (...args: unknown[]) => {
      received.push(args)
      return Promise.resolve('swept')
    })

    await expect(handler.handle(queued)).resolves.toBe('swept')

    expect(handler.job).toBe(SES_INBOUND_PROCESS_JOB)
    expect(received).toEqual([[]])
  })
})
