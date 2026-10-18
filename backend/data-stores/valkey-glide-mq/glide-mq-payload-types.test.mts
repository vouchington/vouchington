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

  const widerPayload = { id: 'safe-looking', token: 'must-not-be-persisted' }
  const enqueueId = createEnqueueFunction<{ id: string }, 'id-only'>({
    queue,
    queueName: 'queue',
    jobName: 'id-only',
  })
  // @ts-expect-error a wider variable cannot smuggle sensitive fields past the declared payload type
  void enqueueId(widerPayload)

  const opaqueEnqueue = createEnqueueFunction<object, 'opaque'>({
    queue,
    queueName: 'queue',
    jobName: 'opaque',
  })
  // @ts-expect-error opaque payload types cannot prove the absence of sensitive fields
  void opaqueEnqueue({ id: 'opaque' })

  const nestedOpaqueEnqueue = createEnqueueFunction<{ metadata: object }, 'nested-opaque'>({
    queue,
    queueName: 'queue',
    jobName: 'nested-opaque',
  })
  // @ts-expect-error nested opaque payload shapes fail closed
  void nestedOpaqueEnqueue({ metadata: { id: 'opaque' } })

  const untypedEnqueue = createEnqueueFunction({
    queue,
    queueName: 'queue',
    jobName: 'untyped',
  })
  // @ts-expect-error an unknown payload must fail closed until the producer declares its shape
  void untypedEnqueue({ email: 'user@example.test' })

  const stringMapEnqueue = createEnqueueFunction<Record<string, string>, 'string-map'>({
    queue,
    queueName: 'queue',
    jobName: 'string-map',
  })
  // @ts-expect-error dynamic string-keyed payloads cannot prove that keys are non-sensitive
  void stringMapEnqueue({ label: 'safe-looking' })

  void createEnqueueFunction<Record<string, string>, 'sensitive-string-map'>({
    queue,
    queueName: 'queue',
    jobName: 'sensitive-string-map',
    sensitive: true,
  })({ token: 'allowed only with sensitive retention' })

  // @ts-expect-error bulk payloads use the same guard
  createBulkEnqueueFunction({
    queue,
    queueName: 'queue',
    jobName: 'batch',
    buildJob: (input: string) => ({ data: { context: { session_id: input } } }),
  })

  const bulkWiderPayload = {
    id: 'safe-looking',
    context: { label: 'safe-looking', email: 'must-not-be-persisted' },
  }
  // @ts-expect-error a wider buildJob result cannot smuggle nested sensitive fields
  createBulkEnqueueFunction({
    queue,
    queueName: 'queue',
    jobName: 'wider-batch',
    buildJob: (_input: string) => ({ data: bulkWiderPayload }),
  })

  type IntendedBulkPayload = { userId: string; metadata: { label: string } }
  const widerBulkPayload: IntendedBulkPayload & {
    metadata: { label: string; token: string }
  } = { userId: 'user-id', metadata: { label: 'safe-looking', token: 'must-not-be-persisted' } }
  // @ts-expect-error builder inference must retain nested sensitive keys beyond the intended shape
  createBulkEnqueueFunction({
    queue,
    queueName: 'queue',
    jobName: 'wider-token-batch',
    buildJob: (_input: string) => ({ data: widerBulkPayload }),
  })

  type UnionPayload = { userId: string } | { userId: string; metadata: { token: string } }
  const unionPayload: UnionPayload = {
    userId: 'user-id',
    metadata: { token: 'must-not-be-persisted' },
  }
  const enqueueUnion = createEnqueueFunction<UnionPayload, 'union'>({
    queue,
    queueName: 'queue',
    jobName: 'union',
  })
  // @ts-expect-error a sensitive member cannot hide behind a safe union member
  void enqueueUnion(unionPayload)
  // @ts-expect-error a sensitive member cannot hide behind a safe union member
  createBulkEnqueueFunction({
    queue,
    queueName: 'queue',
    jobName: 'union-batch',
    buildJob: (_input: string) => ({ data: unionPayload }),
  })
  // @ts-expect-error background definitions reject a sensitive member in a payload union
  defineBackgroundJob<UnionPayload>(domain, { name: 'union-payload', priority: 10 })
  type NestedUnionPayload = { userId: string; next?: UnionPayload }
  // @ts-expect-error a wider sensitive member stays detectable beneath a previously seen parent
  defineBackgroundJob<NestedUnionPayload>(domain, { name: 'nested-union-payload', priority: 10 })

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

  void createBulkEnqueueFunction({
    queue,
    queueName: 'queue',
    jobName: 'safe-batch',
    sensitive: true,
    buildJob: (input: string) => ({ data: { context: { session_id: input } } }),
  })(['one'])
}

describe('GlideMQ payload type guard', () => {
  it('rejects nested sensitive fields unless the job opts into sensitive retention', () => {
    expect(assertSensitivePayloadTypesAtCompileTime).toBeTypeOf('function')
  })
})
