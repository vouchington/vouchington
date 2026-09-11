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

const DEV_ENV = { NODE_ENV: 'development' }

describe('WorkerLogger', () => {
  let originalLogLevel: string | undefined

  let writeSpy: Mock

  beforeEach(() => {
    originalLogLevel = process.env.LOG_LEVEL
    // Default to info so tests that construct a dev-mode logger see verbose output.
    // Tests that explicitly want error mode set LOG_LEVEL=error in their own beforeEach.
    process.env.LOG_LEVEL = 'info'
    writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true) as Mock
  })

  afterEach(() => {
    if (originalLogLevel === undefined) {
      delete process.env.LOG_LEVEL
    } else {
      process.env.LOG_LEVEL = originalLogLevel
    }
    vi.restoreAllMocks()
  })

  it('is disabled in production', () => {
    expect(new WorkerLogger({ env: { NODE_ENV: 'production' } }).isEnabled()).toBe(false)
  })

  it('is disabled on staging, even though ECS sets NODE_ENV=production there too', () => {
    expect(
      new WorkerLogger({ env: { ENVIRONMENT: 'staging', NODE_ENV: 'production' } }).isEnabled(),
    ).toBe(false)
  })

  it('is disabled in test', () => {
    expect(new WorkerLogger({ env: { NODE_ENV: 'test' } }).isEnabled()).toBe(false)
  })

  it('is enabled in development', () => {
    expect(new WorkerLogger({ env: DEV_ENV }).isEnabled()).toBe(true)
  })

  it('produces no output when disabled', () => {
    const logger = new WorkerLogger({ env: { NODE_ENV: 'test' } })
    const job = makeJob()
    logger.onActive('emails', job)
    logger.onCompleted('emails', job)
    logger.onFailed('emails', job, new Error('boom'))
    expect(writeSpy).not.toHaveBeenCalled()
  })

  it('onActive does not produce output', () => {
    const logger = new WorkerLogger({ env: DEV_ENV })
    logger.onActive('emails', makeJob())
    expect(writeSpy).not.toHaveBeenCalled()
  })

  it('completed line prints " ok" with green color', () => {
    const logger = new WorkerLogger({ env: DEV_ENV })
    const job = makeJob()
    logger.onActive('emails', job)
    logger.onCompleted('emails', job)
    const output = writeSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('')
    expect(output).toContain(' ok')
    expect(output).toContain('\x1b[32m') // GREEN
  })

  it('completed line includes timing', () => {
    const logger = new WorkerLogger({ env: DEV_ENV })
    const job = makeJob()
    logger.onActive('emails', job)
    logger.onCompleted('emails', job)
    const output = writeSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('')
    expect(output).toMatch(/\d+ms/)
  })

  it('completed line includes queue and job name', () => {
    const logger = new WorkerLogger({ env: DEV_ENV })
    const job = makeJob({ name: 'send-email' })
    logger.onActive('emails', job)
    logger.onCompleted('emails', job)
    const output = writeSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('')
    expect(output).toContain('emails/send-email')
  })

  it('completed line includes job data', () => {
    const logger = new WorkerLogger({ env: DEV_ENV })
    const job = makeJob({ data: { to: 'tests+user@voucha.ai' } })
    logger.onActive('emails', job)
    logger.onCompleted('emails', job)
    const output = writeSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('')
    expect(output).toContain('tests+user@voucha.ai')
  })

  it('completed line has no bar characters', () => {
    const logger = new WorkerLogger({ env: DEV_ENV })
    const job = makeJob()
    logger.onActive('emails', job)
    logger.onCompleted('emails', job)
    const output = writeSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('')
    expect(output).not.toContain('┬')
    expect(output).not.toContain('┴')
    expect(output).not.toContain('│')
    expect(output).not.toContain('┈')
  })

  it('uses job timestamps as timing fallback when onActive was not called', () => {
    const logger = new WorkerLogger({ env: DEV_ENV })
    const job = makeJob({ processedOn: 1000, finishedOn: 1042 })
    logger.onCompleted('emails', job)
    const output = writeSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('')
    expect(output).toContain('42ms')
  })

  it('failed line prints "ERR" with red color', () => {
    const logger = new WorkerLogger({ env: DEV_ENV })
    const job = makeJob()
    logger.onActive('emails', job)
    logger.onFailed('emails', job, new Error('boom'))
    const output = writeSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('')
    expect(output).toContain('ERR')
    expect(output).toContain('\x1b[31m') // RED
  })

  it('failed line includes timing', () => {
    const logger = new WorkerLogger({ env: DEV_ENV })
    const job = makeJob()
    logger.onActive('emails', job)
    logger.onFailed('emails', job, new Error('boom'))
    const output = writeSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('')
    expect(output).toMatch(/\d+ms/)
  })

  it('failed line includes error message', () => {
    const logger = new WorkerLogger({ env: DEV_ENV })
    const job = makeJob()
    logger.onActive('emails', job)
    logger.onFailed('emails', job, new Error('connection refused'))
    const output = writeSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('')
    expect(output).toContain('Error: connection refused')
  })

  it('failed line includes error name for non-standard errors', () => {
    const logger = new WorkerLogger({ env: DEV_ENV })
    const job = makeJob()
    logger.onActive('emails', job)
    const err = new Error('not found')
    err.name = 'StoryRaceConditionError'
    logger.onFailed('emails', job, err)
    const output = writeSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('')
    expect(output).toContain('StoryRaceConditionError: not found')
  })

  it('failed line truncates long error messages', () => {
    const logger = new WorkerLogger({ env: DEV_ENV })
    const job = makeJob()
    logger.onActive('emails', job)
    logger.onFailed('emails', job, new Error('x'.repeat(200)))
    const output = writeSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('')
    expect(output).toContain('...')
  })

  it('failed line handles non-Error string throws without crashing', () => {
    const logger = new WorkerLogger({ env: DEV_ENV })
    const job = makeJob()
    logger.onActive('emails', job)
    logger.onFailed('emails', job, 'something went wrong')
    const output = writeSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('')
    expect(output).toContain('something went wrong')
  })

  it('failed line handles non-Error object throws without crashing', () => {
    const logger = new WorkerLogger({ env: DEV_ENV })
    const job = makeJob()
    logger.onActive('emails', job)
    logger.onFailed('emails', job, { code: 'ECONNREFUSED' })
    const output = writeSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('')
    expect(output).toContain('[object Object]')
  })

  it('failed line has no bar characters', () => {
    const logger = new WorkerLogger({ env: DEV_ENV })
    const job = makeJob()
    logger.onActive('emails', job)
    logger.onFailed('emails', job, new Error('boom'))
    const output = writeSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('')
    expect(output).not.toContain('┬')
    expect(output).not.toContain('┴')
    expect(output).not.toContain('│')
    expect(output).not.toContain('┈')
  })

  it('yellow timing threshold', () => {
    const logger = new WorkerLogger({
      env: DEV_ENV,
      timingThresholds: { yellow: 0, orange: 250, red: 500 },
    })
    const job = makeJob()
    logger.onActive('q', job)
    logger.onCompleted('q', job)
    const output = writeSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('')
    expect(output).toContain('\x1b[33m') // YELLOW
  })
})
