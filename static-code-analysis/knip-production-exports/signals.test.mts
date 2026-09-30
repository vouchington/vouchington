import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'

import { exitCodeForSignal, watchSignals } from './signals.mts'

describe('watchSignals', () => {
  it('aborts with the signal name for each watched signal', () => {
    for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
      const source = new EventEmitter()
      const watch = watchSignals(source)
      expect(watch.abort.aborted).toBe(false)
      source.emit(name)
      expect(watch.abort.aborted).toBe(true)
      expect(watch.abort.reason).toBe(name)
    }
  })

  it('keeps the first reason and swallows repeats so the restore is not cut short', () => {
    const source = new EventEmitter()
    const watch = watchSignals(source)
    source.emit('SIGTERM')
    source.emit('SIGINT')
    expect(watch.abort.reason).toBe('SIGTERM')
    expect(source.listenerCount('SIGINT')).toBe(1)
  })

  it('removes its listeners on dispose', () => {
    const source = new EventEmitter()
    const watch = watchSignals(source)
    expect(source.listenerCount('SIGINT')).toBe(1)
    watch.dispose()
    for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP']) expect(source.listenerCount(name)).toBe(0)
  })

  it('defaults to the real process without leaving listeners behind', () => {
    const before = process.listenerCount('SIGINT')
    const watch = watchSignals()
    expect(process.listenerCount('SIGINT')).toBe(before + 1)
    watch.dispose()
    expect(process.listenerCount('SIGINT')).toBe(before)
  })
})

describe('exitCodeForSignal', () => {
  it('is 128 plus the signal number', () => {
    expect(exitCodeForSignal('SIGHUP')).toBe(129)
    expect(exitCodeForSignal('SIGINT')).toBe(130)
    expect(exitCodeForSignal('SIGTERM')).toBe(143)
  })

  it('treats anything else as SIGTERM', () => {
    expect(exitCodeForSignal(undefined)).toBe(143)
    expect(exitCodeForSignal('SIGUSR1')).toBe(143)
  })
})
