import { describe, expect, it } from 'vitest'
import { createBulkEnqueueFunction, createEnqueueFunction } from './glide-mq-enqueue.mts'
import { defineBackgroundJob } from '../../queues/background/enqueues/define-job.mts'
import { createBackgroundEnqueue } from '../../queues/background/enqueues.mts'

const queue = undefined as never
const domain = undefined as never

function assertSensitivePayloadTypesAtCompileTime(): void {
  const enqueueUser = createEnqueueFunction<{ profile: { emailAddress: string } }, 'user-created'>({
    queue,
    queueName: 'queue',
    jobName: 'user-created',
  })
  // @ts-expect-error nested emailAddress fields require sensitive: true
  void enqueueUser({ profile: { emailAddress: 'user@example.test' } })

  // @ts-expect-error bulk payloads use the same guard
  createBulkEnqueueFunction<string, { context: { session_id: string } }, 'batch'>({
    queue,
    queueName: 'queue',
    jobName: 'batch',
    buildJob: () => ({ data: { context: { session_id: 'secret' } } }),
  })

  // @ts-expect-error sensitive background data requires sensitive: true at definition
  defineBackgroundJob<{ nested: { phone_number: string } }>(domain, {
    name: 'unsafe',
    priority: 10,
  })

  const safeBackgroundJob = defineBackgroundJob<{ nested: { phone_number: string } }>(domain, {
    name: 'safe',
    priority: 10,
    sensitive: true,
  })
  void createBackgroundEnqueue(safeBackgroundJob)({ nested: { phone_number: '+15555550123' } })

  void createEnqueueFunction<{ profile: { emailAddress: string } }, 'safe-user-created'>({
    queue,
    queueName: 'queue',
    jobName: 'safe-user-created',
    sensitive: true,
  })({ profile: { emailAddress: 'user@example.test' } })

  void createBulkEnqueueFunction<string, { context: { session_id: string } }, 'safe-batch'>({
    queue,
    queueName: 'queue',
    jobName: 'safe-batch',
    sensitive: true,
    buildJob: () => ({ data: { context: { session_id: 'secret' } } }),
  })(['one'])
}

describe('GlideMQ payload type guard', () => {
  it('rejects nested sensitive fields unless the job opts into sensitive retention', () => {
    expect(assertSensitivePayloadTypesAtCompileTime).toBeTypeOf('function')
  })
})
