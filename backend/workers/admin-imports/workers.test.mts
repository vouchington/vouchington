import type { Job } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import {
  IMPORTS_DISPATCH_ADMIN_TOPIC_IMPORT_JOB,
  IMPORTS_PROCESS_ADMIN_TOPIC_IMPORT_ROW_JOB,
} from '@queues/background/enqueues/imports-jobs'
import { adminImportsHandlers } from './workers.mts'

function handlerFor(name: string) {
  const handler = adminImportsHandlers.find(candidate => candidate.job.name === name)
  if (!handler) throw new Error(`No admin import handler for ${name}`)
  return handler
}

describe('adminImportsHandlers', () => {
  it('registers one handler for each job of the admin half of the imports domain', () => {
    expect(adminImportsHandlers.map(handler => handler.job.name).toSorted()).toEqual([
      IMPORTS_DISPATCH_ADMIN_TOPIC_IMPORT_JOB.name,
      IMPORTS_PROCESS_ADMIN_TOPIC_IMPORT_ROW_JOB.name,
    ])
  })

  it('rejects a row job without a batch id or row id', () => {
    const handler = handlerFor(IMPORTS_PROCESS_ADMIN_TOPIC_IMPORT_ROW_JOB.name)

    expect(() => handler.handle({ data: { rowId: 'row-1' } } as Job<never>)).toThrow(
      'Admin import job .batchId is required',
    )
    expect(() => handler.handle({ data: { batchId: 'batch-1' } } as Job<never>)).toThrow(
      'Admin import job .rowId is required',
    )
  })

  it('rejects a dispatch job without a batch id', () => {
    expect(() =>
      handlerFor(IMPORTS_DISPATCH_ADMIN_TOPIC_IMPORT_JOB.name).handle({ data: {} } as Job<never>),
    ).toThrow('Admin import dispatch job .batchId is required')
  })

  it('hands a row job to the row processor, which ignores a row that does not exist', async () => {
    const id = '00000000-0000-7000-8000-000000000001'

    await expect(
      handlerFor(IMPORTS_PROCESS_ADMIN_TOPIC_IMPORT_ROW_JOB.name).handle({
        data: { batchId: id, rowId: id },
        attemptsMade: 0,
      } as Job<never>),
    ).resolves.toBeUndefined()
  })
})
