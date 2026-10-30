import { describe, expect, it } from 'vitest'
import { diagnoseValkey } from './diagnostics.mts'
import { createFlushTargetPrefixRegistry } from './flush-targets.mts'

const registry = createFlushTargetPrefixRegistry(['glide:usage:'])

describe('Valkey diagnostic cancellation', () => {
  it('stops when the caller aborts before diagnosis', async () => {
    const controller = new AbortController()
    const reason = new Error('cancel diagnostics')
    controller.abort(reason)
    await expect(diagnoseValkey(registry, controller.signal)).rejects.toBe(reason)
  })
})
