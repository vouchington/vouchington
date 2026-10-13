import { describe, expect, it, vi } from 'vitest'
import { observeAwsReplayAbort } from './aws-replay-abort-signal.mts'

describe('shared legacy AWS abort signals', () => {
  it.each([
    [0, 1],
    [1, 0],
  ] as const)('detaches observers in completion order %s then %s', (first, last) => {
    const original = vi.fn<() => void>()
    const source = { aborted: false, onabort: original }
    const observers = [observeAwsReplayAbort(source), observeAwsReplayAbort(source)]
    observers[first].detach()
    source.aborted = true
    source.onabort()
    expect(observers[first].signal?.aborted).toBe(false)
    expect(observers[last].signal?.aborted).toBe(true)
    expect(original).toHaveBeenCalledOnce()
    observers[last].detach()
    expect(source.onabort).toBe(original)
  })
})
