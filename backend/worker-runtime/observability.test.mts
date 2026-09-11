import { EventEmitter } from 'node:events'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { sentryCaptureExceptionMock as captureException } from '../test-helpers/vitest.setup.sentry-mock.mts'
import { CrawlerTimeoutError } from '@modules/on-error/errors'

vi.stubEnv('NODE_ENV', 'test')
vi.stubEnv('ENVIRONMENT', 'test')

const { addWorkerEventListeners, addSqsConsumerEventListeners } =
  await import('./observability.mts')

class FakeWorker extends EventEmitter {
  readonly name: string

  constructor(name: string) {
    super()
    this.name = name
  }
}

class FakeSqsConsumer extends EventEmitter {
  readonly name: string

  constructor(name: string) {
    super()
    this.name = name
  }
}

describe('worker observability', () => {
  let consoleSpy: Mock

  beforeEach(() => {
    captureException.mockClear()
    consoleSpy = vi.spyOn(console, 'error').mockReturnValue(undefined) as Mock
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  afterAll(() => vi.unstubAllEnvs())

  it('console.error is used for failed jobs when logger is disabled', () => {
    const worker = new FakeWorker('emails')
    addWorkerEventListeners(worker as any)

    const error = new Error('boom')
    const failedJob = {
      name: 'send',
      id: 'job-42',
      data: { userId: 'u123', payload: 'test' },
      attemptsMade: 2,
      opts: { attempts: 3 },
      processedOn: 200,
      finishedOn: 260,
    }
    worker.emit('failed', failedJob, error)

    expect(consoleSpy).toHaveBeenCalledWith(
      'job failed: %s %o (%dms) %s',
      'send',
      { queue: 'emails', job_id: 'job-42', job_data: { payload: 'test', userId: 'u123' } },
      60,
      error,
    )
    expect(captureException).toHaveBeenCalledWith(error, expect.anything())
    const capturedErr = captureException.mock.calls[0][0] as Error & {
      tags?: Record<string, unknown>
      extra?: Record<string, unknown>
    }
    expect(capturedErr.tags).toMatchObject({
      queue: 'emails',
      job_id: 'job-42',
      job_name: 'send',
    })
    expect(capturedErr.extra).toMatchObject({
      attempts: 3,
      job_name: 'send',
      job_data: { payload: 'test', userId: 'u123' },
    })
    expect(capturedErr.extra).not.toHaveProperty('attempts_made')
    expect(capturedErr.extra).not.toHaveProperty('previous_state')
  })

  it('redacts PII/secret-shaped job data keys but keeps other values in CloudWatch logs and Sentry extra', () => {
    const worker = new FakeWorker('emails')
    addWorkerEventListeners(worker as any)

    const error = new Error('boom')
    const failedJob = {
      name: 'send_email_address_login_token',
      id: 'job-99',
      data: {
        emailAddress: 'tests+failedjob@voucha.ai',
        token: 'login-token',
        userId: '11111111-1111-4111-8111-111111111111',
        attemptsRemaining: 2,
      },
      attemptsMade: 1,
      opts: { attempts: 3 },
      processedOn: 200,
      finishedOn: 260,
    }
    worker.emit('failed', failedJob, error)

    const expectedJobData = {
      attemptsRemaining: 2,
      emailAddress: '[Filtered]',
      token: '[Filtered]',
      userId: '11111111-1111-4111-8111-111111111111',
    }
    expect(consoleSpy).toHaveBeenCalledWith(
      'job failed: %s %o (%dms) %s',
      'send_email_address_login_token',
      { queue: 'emails', job_id: 'job-99', job_data: expectedJobData },
      60,
      error,
    )
    const extra = (captureException.mock.calls[0][0] as Error & { extra?: Record<string, unknown> })
      .extra
    expect(extra?.job_data).toEqual(expectedJobData)
    expect(JSON.stringify(extra)).not.toContain('tests+failedjob@voucha.ai')
    expect(JSON.stringify(extra)).not.toContain('login-token')
    expect(JSON.stringify(extra)).toContain('11111111-1111-4111-8111-111111111111')
  })

  it('omits job_data for empty or non-object payloads and logs unknown job ids', () => {
    const worker = new FakeWorker('emails')
    addWorkerEventListeners(worker as any)
    const emitFailed = (data: unknown, id?: string) => {
      const error = new Error('boom')
      worker.emit('failed', { name: 'send', id, data, processedOn: 200, finishedOn: 250 }, error)
      return error
    }
    const capturedExtra = () => {
      const lastCall = captureException.mock.calls.at(-1)
      if (lastCall === undefined) throw new Error('expected captureException call')
      return (lastCall[0] as Error & { extra?: Record<string, unknown> }).extra
    }

    const error = emitFailed({})
    expect(consoleSpy).toHaveBeenCalledWith(
      'job failed: %s %o (%dms) %s',
      'send',
      { queue: 'emails', job_id: 'unknown' },
      50,
      error,
    )
    expect(capturedExtra()).not.toHaveProperty('job_data')

    emitFailed(['not-an-object'], 'job-array')
    expect(capturedExtra()).not.toHaveProperty('job_data')

    const manyKeys = Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`k${i}`, i]))
    emitFailed(manyKeys, 'job-keys')
    const expectedKeys = Object.keys(manyKeys).sort().slice(0, 32)
    expect(capturedExtra()?.job_data).toEqual(
      Object.fromEntries(expectedKeys.map(key => [key, manyKeys[key]])),
    )
  })

  it('does not throw while reporting failed jobs without options', () => {
    const worker = new FakeWorker('emails')
    addWorkerEventListeners(worker as any)

    const error = new Error('boom')
    const failedJob = {
      name: 'send',
      id: 'job-42',
      data: { userId: 'u123' },
      processedOn: 200,
      finishedOn: 260,
    }

    expect(() => worker.emit('failed', failedJob, error)).not.toThrow()

    const capturedErr = captureException.mock.calls[0][0] as Error & {
      extra?: Record<string, unknown>
    }
    expect(capturedErr.extra).not.toHaveProperty('attempts')
  })

  it('expected crawler failures skip Sentry reporting', () => {
    const worker = new FakeWorker('crawl_urls')
    addWorkerEventListeners(worker as any)

    const error = new CrawlerTimeoutError('https://example.com', 10_000, 10_000)
    const failedJob = {
      name: 'crawl_url',
      id: 'j1',
      data: {},
      attemptsMade: 1,
      opts: { attempts: 3 },
      processedOn: 100,
      finishedOn: 110,
    }
    worker.emit('failed', failedJob, error)

    expect(consoleSpy).not.toHaveBeenCalled()
    expect(captureException).not.toHaveBeenCalled()
  })
})

describe('SQS consumer observability', () => {
  beforeEach(() => {
    captureException.mockClear()
  })

  it('tracks closing/closed lifecycle events without reporting an error', () => {
    const consumer = new FakeSqsConsumer('bedrock-batch-sqs')
    addSqsConsumerEventListeners(consumer as any)

    expect(() => {
      consumer.emit('closing')
      consumer.emit('closed')
    }).not.toThrow()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('tags poll-error with the queue name and reports it', () => {
    const consumer = new FakeSqsConsumer('bedrock-batch-sqs')
    addSqsConsumerEventListeners(consumer as any)

    const error = new Error('poll boom')
    consumer.emit('poll-error', error)

    expect(captureException).toHaveBeenCalledWith(error, expect.anything())
    const capturedErr = captureException.mock.calls[0][0] as Error & {
      tags?: Record<string, unknown>
    }
    expect(capturedErr.tags).toMatchObject({ queue: 'bedrock-batch-sqs' })
    expect(capturedErr.tags).not.toHaveProperty('message_id')
  })

  it('measures elapsed time between message-received and message-deleted without erroring', () => {
    const consumer = new FakeSqsConsumer('bedrock-batch-sqs')
    addSqsConsumerEventListeners(consumer as any)
    const message = { messageId: 'm1', body: '{}', receiptHandle: 'rh1' }

    expect(() => {
      consumer.emit('message-received', message)
      consumer.emit('message-deleted', message)
    }).not.toThrow()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('does not throw for a deleted message with no matching received start time', () => {
    const consumer = new FakeSqsConsumer('bedrock-batch-sqs')
    addSqsConsumerEventListeners(consumer as any)
    const message = { messageId: 'unseen', body: '{}', receiptHandle: 'rh1' }

    expect(() => consumer.emit('message-deleted', message)).not.toThrow()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('tags message-failed with the queue and message id and reports it', () => {
    const consumer = new FakeSqsConsumer('bedrock-batch-sqs')
    addSqsConsumerEventListeners(consumer as any)
    const message = { messageId: 'm2', body: 'bad', receiptHandle: 'rh2' }
    const error = new Error('handler boom')

    consumer.emit('message-received', message)
    consumer.emit('message-failed', message, error)

    expect(captureException).toHaveBeenCalledWith(error, expect.anything())
    const capturedErr = captureException.mock.calls[0][0] as Error & {
      tags?: Record<string, unknown>
    }
    expect(capturedErr.tags).toMatchObject({ queue: 'bedrock-batch-sqs', message_id: 'm2' })
  })

  it('tags message-delete-failed with the queue and message id and reports it', () => {
    const consumer = new FakeSqsConsumer('bedrock-batch-sqs')
    addSqsConsumerEventListeners(consumer as any)
    const message = { messageId: 'm3', body: '{}', receiptHandle: 'rh3' }
    const error = new Error('delete boom')

    consumer.emit('message-received', message)
    consumer.emit('message-delete-failed', message, error)

    expect(captureException).toHaveBeenCalledWith(error, expect.anything())
    const capturedErr = captureException.mock.calls[0][0] as Error & {
      tags?: Record<string, unknown>
    }
    expect(capturedErr.tags).toMatchObject({ queue: 'bedrock-batch-sqs', message_id: 'm3' })
  })
})
