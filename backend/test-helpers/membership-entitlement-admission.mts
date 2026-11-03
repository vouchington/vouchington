import { vi } from 'vitest'
import * as analyticsEmit from '@data-stores/analytics/emit'
import { memberships } from '../queues/memberships/queues.mts'

const ENTITLEMENT_EFFECTS_JOB = 'deliverMembershipEntitlementEffects'

/**
 * Observes the real membership queue admission for entitlement effects. The real `add` always
 * runs. `gate` holds its result so a test can prove a caller waits for admission, and
 * `trackingFailure` makes the enqueue metric throw after the add starts.
 */
export function spyOnMembershipEntitlementAdmission(
  options: { gate?: Promise<unknown>; trackingFailure?: Error } = {},
) {
  const original = memberships.add
  const started = Promise.withResolvers<void>()
  const spy = vi.spyOn(memberships, 'add').mockImplementation((name, ...args) => {
    const admission = original.call(memberships, name, ...args)
    if (name !== ENTITLEMENT_EFFECTS_JOB) return admission
    started.resolve()
    if (!options.gate) return admission
    return admission.then(async job => {
      await options.gate
      return job
    })
  })
  const { trackingFailure } = options
  const originalEmit = analyticsEmit.emit
  const tracking = trackingFailure
    ? vi.spyOn(analyticsEmit, 'emit').mockImplementation((table, record) => {
        if (table === 'queue_jobs') throw trackingFailure
        originalEmit(table, record)
      })
    : undefined
  return {
    started: started.promise,
    admissionCount: () =>
      spy.mock.calls.filter(([name]) => name === ENTITLEMENT_EFFECTS_JOB).length,
    restore: () => {
      tracking?.mockRestore()
      spy.mockRestore()
    },
  }
}
