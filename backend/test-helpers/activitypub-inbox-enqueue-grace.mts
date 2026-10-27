import { onTestFinished, vi } from 'vitest'
import * as enqueueGrace from '../workers/activitypub/processors/inbox-enqueue-grace.mts'

/**
 * Treats every inbound envelope as past the enqueue grace until the test finishes, so recovery
 * replaces a freshly inserted fixture. Module mocks of internal modules are disallowed, so this spies.
 */
export function skipActivityPubInboxEnqueueGrace(): void {
  const spy = vi.spyOn(enqueueGrace, 'isInsideActivityPubInboxEnqueueGrace').mockReturnValue(false)
  onTestFinished(() => {
    spy.mockRestore()
  })
}
