import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SNAPSHOT_STREAM_REATTACH_BASE_MS,
  SNAPSHOT_STREAM_REATTACH_MAX_MS,
  useSnapshotStream,
} from './use-snapshot-stream'

type Listener = (event: MessageEvent) => void

class MockEventSource {
  static readonly CLOSED = 2
  static instances: MockEventSource[] = []
  readyState = 0
  closed = false
  onerror: (() => void) | null = null
  readonly listeners = new Set<Listener>()

  constructor(readonly url: string) {
    MockEventSource.instances.push(this)
  }

  addEventListener(_type: string, fn: Listener) {
    this.listeners.add(fn)
  }

  close() {
    this.closed = true
  }

  emit(data: string) {
    this.listeners.forEach(fn => fn(new MessageEvent('snapshot', { data })))
  }

  fail(readyState: number) {
    this.readyState = readyState
    this.onerror?.()
  }
}

function setup() {
  const loadFallback = vi.fn<(shouldApply: () => boolean) => void>()
  const onSnapshot = vi.fn<(event: MessageEvent, stopFallback: () => void) => void>()
  const hook = renderHook(() =>
    useSnapshotStream({ url: '/stream', fallbackIntervalMs: 10_000, onSnapshot, loadFallback }),
  )
  return { loadFallback, onSnapshot, ...hook }
}

describe('useSnapshotStream', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    MockEventSource.instances = []
    vi.stubGlobal('EventSource', MockEventSource)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('leaves a source that is still reconnecting to native EventSource', () => {
    const { loadFallback } = setup()
    const first = MockEventSource.instances[0]!

    act(() => first.fail(0))
    vi.advanceTimersByTime(SNAPSHOT_STREAM_REATTACH_MAX_MS)

    expect(MockEventSource.instances).toHaveLength(1)
    expect(first.closed).toBe(false)
    expect(loadFallback).toHaveBeenCalled()
  })

  it('replaces a permanently closed source and polls over REST meanwhile', () => {
    const { loadFallback } = setup()
    const first = MockEventSource.instances[0]!

    act(() => first.fail(MockEventSource.CLOSED))
    expect(loadFallback).toHaveBeenCalledTimes(1)
    act(() => first.fail(MockEventSource.CLOSED))
    expect(loadFallback).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(SNAPSHOT_STREAM_REATTACH_BASE_MS - 1)
    expect(MockEventSource.instances).toHaveLength(1)

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(first.closed).toBe(true)
    expect(MockEventSource.instances).toHaveLength(2)
    expect(MockEventSource.instances[1]!.url).toBe('/stream')
  })

  it('backs off while replacements keep closing, capped, and resets on a snapshot', () => {
    setup()
    const delays = [5_000, 10_000, 20_000, 40_000, 60_000, 60_000]
    expect(delays.at(-1)).toBe(SNAPSHOT_STREAM_REATTACH_MAX_MS)
    for (const [index, delay] of delays.entries()) {
      const source = MockEventSource.instances.at(-1)!
      act(() => source.fail(MockEventSource.CLOSED))
      act(() => {
        vi.advanceTimersByTime(delay - 1)
      })
      expect(MockEventSource.instances).toHaveLength(index + 1)
      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(MockEventSource.instances).toHaveLength(index + 2)
    }

    act(() => MockEventSource.instances.at(-1)!.emit('{}'))
    const count = MockEventSource.instances.length
    act(() => MockEventSource.instances.at(-1)!.fail(MockEventSource.CLOSED))
    act(() => {
      vi.advanceTimersByTime(SNAPSHOT_STREAM_REATTACH_BASE_MS)
    })

    expect(MockEventSource.instances).toHaveLength(count + 1)
  })

  it('stops REST polling when a snapshot supersedes it and forwards the event', () => {
    const { loadFallback, onSnapshot } = setup()
    onSnapshot.mockImplementation((_event, stopFallback) => stopFallback())
    const source = MockEventSource.instances[0]!

    act(() => source.fail(0))
    expect(loadFallback).toHaveBeenCalledTimes(1)
    const staleShouldApply = loadFallback.mock.calls[0]![0]
    act(() => source.emit('{"ok":true}'))
    loadFallback.mockClear()
    vi.advanceTimersByTime(30_000)

    expect(onSnapshot).toHaveBeenCalledTimes(1)
    expect(staleShouldApply()).toBe(false)
    expect(loadFallback).not.toHaveBeenCalled()
  })

  it('cancels the pending reattach and closes the source on unmount', () => {
    const { unmount } = setup()
    const first = MockEventSource.instances[0]!
    act(() => first.fail(MockEventSource.CLOSED))

    unmount()
    vi.advanceTimersByTime(SNAPSHOT_STREAM_REATTACH_MAX_MS)

    expect(MockEventSource.instances).toHaveLength(1)
    expect(first.closed).toBe(true)
  })

  it('unmounts cleanly with no pending reattach', () => {
    const { unmount } = setup()
    unmount()
    expect(MockEventSource.instances[0]!.closed).toBe(true)
  })
})
