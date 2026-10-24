import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { sentryCaptureExceptionMock as captureException } from '../test-helpers/vitest.setup.sentry-mock.mts'
import { CrawlerTimeoutError } from '@modules/on-error/errors'

vi.stubEnv('NODE_ENV', 'test')
vi.stubEnv('ENVIRONMENT', 'test')

const { addWorkerEventListeners, addSqsConsumerEventListeners } =
  await import('./observability.mts')

class FakeNamedEmitter extends EventEmitter {
  readonly name: string

  constructor(name: string) {
    super()
    this.name = name
  }
}

type ReportedError = Error & {
  tags?: Record<string, unknown>
  extra?: Record<string, unknown>
}

describe('worker observability wiring', () => {
  let consoleError: Mock
  let consoleLog: Mock

  beforeEach(() => {
    captureException.mockClear()
    consoleError = vi.spyOn(console, 'error').mockReturnValue(undefined) as Mock
    consoleLog = vi.spyOn(console, 'log').mockReturnValue(undefined) as Mock
  })

  afterEach(() => {
    consoleError.mockRestore()
    consoleLog.mockRestore()
  })

  it('reports a failed job with the app-redacted job data and keeps safe values', () => {
    const worker = new FakeNamedEmitter('emails')
    addWorkerEventListeners(worker as never)

    const error = new Error('boom')
    worker.emit(
      'failed',
      {
        name: 'send',
        id: 'job-99',
        data: {
          emailAddress: 'tests+failedjob@voucha.ai',
          code: 'a3f9c2e1',
          userId: '11111111-1111-4111-8111-111111111111',
        },
        opts: { attempts: 3 },
        processedOn: 200,
        finishedOn: 260,
      },
      error,
    )

    const reported = captureException.mock.calls[0][0] as ReportedError
    expect(reported.tags).toMatchObject({ queue: 'emails', job_name: 'send', job_id: 'job-99' })
    expect(reported.extra?.job_data).toEqual({
      code: '[Filtered]',
      emailAddress: '[Filtered]',
      userId: '11111111-1111-4111-8111-111111111111',
    })
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('tests+failedjob@voucha.ai')
  })

  it('does not log an expected crawler failure', () => {
    const worker = new FakeNamedEmitter('crawl_embeds')
    addWorkerEventListeners(worker as never)

    worker.emit(
      'failed',
      { name: 'crawl', id: 'job-1', data: {}, processedOn: 200, finishedOn: 250 },
      new CrawlerTimeoutError('https://example.com', 10_000, 10_000),
    )

    expect(consoleError).not.toHaveBeenCalled()
  })

  it('logs completed jobs under test so the image smoke test can see them', () => {
    const worker = new FakeNamedEmitter('heartbeat')
    addWorkerEventListeners(worker as never)

    worker.emit('completed', { name: 'heartbeat', id: 'job-1', processedOn: 200, finishedOn: 215 })

    expect(consoleLog).toHaveBeenCalledWith('job completed: %s (%dms)', 'heartbeat', 15)
  })

  it('reports SQS consumer failures tagged with the queue and message id', () => {
    const consumer = new FakeNamedEmitter('ses-bounce-sqs')
    addSqsConsumerEventListeners(consumer as never)

    const error = new Error('handler failed')
    consumer.emit('message-failed', { messageId: 'message-1' }, error)

    const reported = captureException.mock.calls[0][0] as ReportedError
    expect(reported.tags).toMatchObject({ queue: 'ses-bounce-sqs', message_id: 'message-1' })
  })
})
