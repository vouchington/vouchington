import { describe, expect, it } from 'vitest'
import { createOwnedQueueEventWaits } from './embedding-creation-event-waits.mts'

describe('owned embedding queue event waits', () => {
  it('retains a terminal rejection when its caller observes it after the deadline', async () => {
    const waits = createOwnedQueueEventWaits('late-fixture', 25)
    const waiting = waits.waitFor('late-job', 'completed')
    const barrier = createOwnedQueueEventWaits('barrier-fixture', 50)

    await expect(barrier.waitFor('barrier-job', 'failed')).rejects.toThrow(
      'GlideMQ queue barrier-fixture job barrier-job failed event did not settle within 50ms',
    )
    // oxlint-disable-next-line no-mistakes/test-no-delayed-rejects -- delayed observation verifies the waiter itself owns rejection handling
    await expect(waiting).rejects.toThrow(
      'GlideMQ queue late-fixture job late-job completed event did not settle within 25ms',
    )
    expect(waits.pending()).toEqual([])
  })

  it.each(['completed', 'failed'] as const)(
    'bounds a missing %s event and unregisters its waiter',
    async event => {
      const waits = createOwnedQueueEventWaits('creation-fixture', 25)
      const waiting = waits.waitFor('job-fixture', event)

      await expect(waiting).rejects.toThrow(
        `GlideMQ queue creation-fixture job job-fixture ${event} event did not settle within 25ms`,
      )
      expect(waits.pending()).toEqual([])
    },
  )

  it.each(['added', 'delay-changed'] as const)(
    'keeps %s waits event-driven and removes them when the event arrives',
    async event => {
      const waits = createOwnedQueueEventWaits('creation-fixture', 25)
      const waiting = waits.waitFor('job-fixture', event)
      expect(waits.pending()).toEqual([{ id: 'job-fixture', event, occurrence: 1 }])
      const terminal = waits.waitFor('job-fixture', 'completed')
      let settled = false
      void waiting.then(
        () => {
          settled = true
        },
        () => {
          settled = true
        },
      )
      await expect(terminal).rejects.toThrow(
        'GlideMQ queue creation-fixture job job-fixture completed event did not settle within 25ms',
      )
      expect(settled).toBe(false)
      expect(waits.pending()).toEqual([{ id: 'job-fixture', event, occurrence: 1 }])

      waits.record('job-fixture', event)

      await expect(waiting).resolves.toBeUndefined()
      expect(waits.pending()).toEqual([])
    },
  )
})
