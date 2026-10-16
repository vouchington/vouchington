import { describe, expect, it } from 'vitest'
import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import { BACKGROUND_JOBS } from '@queues/background/enqueues/registry'
import { SES_INBOUND_PROCESS_JOB } from '@queues/background/enqueues/ses-inbound-jobs'
import { buildHandlerMap } from '../processors/handler-map.mts'
import { BACKGROUND_HANDLERS } from '../processors/handlers.mts'

describe('background handler map', () => {
  it('reaches a handler for every registered job name, each owned by its own job', () => {
    const handlers = buildHandlerMap(BACKGROUND_HANDLERS)

    expect([...handlers.keys()].toSorted()).toEqual(BACKGROUND_JOBS.map(job => job.name).toSorted())
    for (const job of BACKGROUND_JOBS) expect(handlers.get(job.name)?.job).toBe(job)
  })

  it('serves only the requested domains', () => {
    const handlers = buildHandlerMap(BACKGROUND_HANDLERS, ['ses-inbound'])

    expect([...handlers.values()].every(handler => handler.job.domain === 'ses-inbound')).toBe(true)
    expect(handlers.size).toBeGreaterThan(0)
    expect(handlers.size).toBeLessThan(BACKGROUND_JOBS.length)
  })

  it('rejects a duplicate handler, a missing handler, and a handler with no registered job', () => {
    const duplicate = backgroundHandler(SES_INBOUND_PROCESS_JOB, () => undefined)
    const unregistered = backgroundHandler(
      { name: 'ses-inbound.unregistered', domain: 'ses-inbound', options: {} },
      () => undefined,
    )

    expect(() => buildHandlerMap([...BACKGROUND_HANDLERS, duplicate])).toThrow('more than one')
    expect(() => buildHandlerMap(BACKGROUND_HANDLERS.slice(1))).toThrow('has no handler')
    expect(() => buildHandlerMap([...BACKGROUND_HANDLERS, unregistered])).toThrow(
      'no registered job',
    )
  })
})
