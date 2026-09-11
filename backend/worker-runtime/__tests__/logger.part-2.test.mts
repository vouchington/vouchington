import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'

import { WorkerLogger } from '../logger.mts'

import type { Job } from 'glide-mq'

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    name: 'send-email',
    data: { to: 'tests+user@voucha.ai' },
    processedOn: 100,
    finishedOn: 150,
    ...overrides,
  } as Job
}

describe('WorkerLogger', () => {
  let originalEnv: string | undefined

  let originalLogLevel: string | undefined

  let writeSpy: Mock

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV
    originalLogLevel = process.env.LOG_LEVEL
    // Default to info so tests that set NODE_ENV=development see verbose output.
    // Tests that explicitly want error mode set LOG_LEVEL=error in their own beforeEach.
    process.env.LOG_LEVEL = 'info'
    writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true) as Mock
  })

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
    if (originalLogLevel === undefined) {
      delete process.env.LOG_LEVEL
    } else {
      process.env.LOG_LEVEL = originalLogLevel
    }
    vi.restoreAllMocks()
  })

  it('orange timing threshold', () => {
    process.env.NODE_ENV = 'development'
    const logger = new WorkerLogger({ timingThresholds: { yellow: 0, orange: 0, red: 500 } })
    const job = makeJob()
    logger.onActive('q', job)
    logger.onCompleted('q', job)
    const output = writeSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('')
    expect(output).toContain('\x1b[38;5;208m') // ORANGE
  })

  it('red timing threshold', () => {
    process.env.NODE_ENV = 'development'
    const logger = new WorkerLogger({ timingThresholds: { yellow: 0, orange: 0, red: 0 } })
    const job = makeJob()
    logger.onActive('q', job)
    logger.onCompleted('q', job)
    const output = writeSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('')
    expect(output).toContain('\x1b[31m') // RED
  })

  it('truncates long data at 120 chars', () => {
    process.env.NODE_ENV = 'development'
    const logger = new WorkerLogger()
    const bigData = { key: 'x'.repeat(200) }
    logger.onCompleted('q', makeJob({ data: bigData }))
    const output = writeSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('')
    expect(output).toContain('...')
  })

  it('handles unserializable data gracefully', () => {
    process.env.NODE_ENV = 'development'
    const logger = new WorkerLogger()
    const circular: Record<string, unknown> = {}
    circular.self = circular
    logger.onCompleted('q', makeJob({ data: circular }))
    const output = writeSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('')
    expect(output).toContain('[unserializable]')
  })

  it('handles undefined data without throwing', () => {
    process.env.NODE_ENV = 'development'
    const logger = new WorkerLogger()
    logger.onCompleted('q', makeJob({ data: undefined }))
    const output = writeSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('')
    expect(output).toContain('undefined')
  })

  describe('LOG_LEVEL=error mode', () => {
    let savedLogLevel: string | undefined

    beforeEach(() => {
      savedLogLevel = process.env.LOG_LEVEL
      process.env.NODE_ENV = 'development'
      process.env.LOG_LEVEL = 'error'
      writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true) as Mock
    })

    afterEach(() => {
      if (savedLogLevel === undefined) {
        delete process.env.LOG_LEVEL
      } else {
        process.env.LOG_LEVEL = savedLogLevel
      }
    })

    it('suppresses onCompleted output', () => {
      const logger = new WorkerLogger()
      const job = makeJob()
      logger.onActive('emails', job)
      logger.onCompleted('emails', job)
      expect(writeSpy).not.toHaveBeenCalled()
    })

    it('still prints failed line', () => {
      const logger = new WorkerLogger()
      const job = makeJob()
      logger.onActive('emails', job)
      logger.onFailed('emails', job, new Error('boom'))
      const output = writeSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('')
      expect(output).toContain('ERR')
      expect(output).toContain('\x1b[31m') // RED
    })

    it('still uses start time from onActive for failed timing', () => {
      const logger = new WorkerLogger()
      const job = makeJob({ processedOn: 1000, finishedOn: 1100 })
      logger.onActive('emails', job)
      logger.onFailed('emails', job, new Error('boom'))
      const output = writeSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('')
      expect(output).toMatch(/\d+ms/)
    })
  })
})
