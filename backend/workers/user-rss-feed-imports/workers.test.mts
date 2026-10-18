import type { Job } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import {
  IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB,
  IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB,
  IMPORTS_RECOVER_STALLED_JOB,
} from '@queues/background/enqueues/imports-jobs'
import { userRssFeedImportsHandlers } from './workers.mts'

function handlerFor(name: string) {
  const handler = userRssFeedImportsHandlers.find(candidate => candidate.job.name === name)
  if (!handler) throw new Error(`No user RSS feed import handler for ${name}`)
  return handler
}

describe('userRssFeedImportsHandlers', () => {
  it('registers one handler for each job of the user half of the imports domain and the sweep', () => {
    expect(userRssFeedImportsHandlers.map(handler => handler.job.name).toSorted()).toEqual([
      IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB.name,
      IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB.name,
      IMPORTS_RECOVER_STALLED_JOB.name,
    ])
  })

  it('rejects a row job without an import id or row id', async () => {
    const handler = handlerFor(IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB.name)

    await expect(handler.handle({ data: { rowId: 'row-1' } } as Job<never>)).rejects.toThrow(
      'User RSS feed import job .importId is required',
    )
    await expect(handler.handle({ data: { importId: 'import-1' } } as Job<never>)).rejects.toThrow(
      'User RSS feed import job .rowId is required',
    )
  })

  it('rejects a dispatch job without an import id', () => {
    expect(() =>
      handlerFor(IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB.name).handle({ data: {} } as Job<never>),
    ).toThrow('User RSS feed import dispatch job .importId is required')
  })

  it('hands a row job to the row processor, which refuses a row that does not exist', async () => {
    const id = '00000000-0000-7000-8000-000000000001'

    await expect(
      handlerFor(IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB.name).handle({
        data: { importId: id, rowId: id },
        attemptsMade: 0,
      } as Job<never>),
    ).rejects.toThrow('not found')
  })

  it('runs both recovery sweeps for the stalled-import job', async () => {
    await expect(
      handlerFor(IMPORTS_RECOVER_STALLED_JOB.name).handle({ data: {} } as Job<never>),
    ).resolves.toBeUndefined()
  })

  it('keeps the default lock: no job asks for a longer one', () => {
    for (const handler of userRssFeedImportsHandlers) {
      expect(handler.job.options.lockDuration).toBeUndefined()
    }
  })
})
