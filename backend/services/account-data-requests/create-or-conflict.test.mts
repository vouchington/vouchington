import { randomUUID } from 'node:crypto'

import { describe, expect, it, onTestFinished, vi } from 'vitest'
import * as psql from '@data-stores/psql'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import { createDataRequest } from './create.mts'
import { createDataRequestOrConflict } from './create-or-conflict.mts'
import { getLatestDataRequest } from './get.mts'
import { markDataRequestFailed } from './update.mts'

/** Make the first `getLatestDataRequest` read miss (as if it ran before a racing insert), then
 * answer each later one from `laterReads`, falling back to the real database. */
function missFirstLatestDataRequestRead(laterReads: Record<string, unknown>[][] = []): void {
  const realRead = psql.read
  const resultOf = (rows: Record<string, unknown>[]) =>
    Promise.resolve({ command: 'SELECT', rowCount: rows.length, oid: 0, fields: [], rows })
  let latestReads = 0
  const spy = vi.spyOn(psql, 'read').mockImplementation((query, ...rest) => {
    const text = typeof query === 'string' ? query : query.text
    if (!text.includes('/* getLatestDataRequest */')) return realRead(query, ...rest)
    latestReads += 1
    if (latestReads === 1) return resultOf([])
    const rows = laterReads[latestReads - 2]
    return rows ? resultOf(rows) : realRead(query, ...rest)
  })
  onTestFinished(() => spy.mockRestore())
}

describe('createDataRequestOrConflict', () => {
  it('returns conflict when insert races and hits active unique index (23505)', async () => {
    const subject = await createTestUser()
    const existing = await createDataRequest(subject.id, subject.id)
    missFirstLatestDataRequestRead()

    const result = await createDataRequestOrConflict(subject.id, subject.id)

    expect(result).toEqual({ type: 'conflict', existing })
  })

  it('returns null conflict metadata when the follow-up read is no longer active', async () => {
    const subject = await createTestUser()
    const failed = await createDataRequest(subject.id, subject.id)
    await markDataRequestFailed(failed.id)
    const failedLatest = await getLatestDataRequest(subject.id, subject.id)
    expect(failedLatest).toMatchObject({ id: failed.id, status: 'failed' })
    await createDataRequest(subject.id, subject.id)
    missFirstLatestDataRequestRead([[{ ...failedLatest }]])

    const result = await createDataRequestOrConflict(subject.id, subject.id)

    expect(result).toEqual({ type: 'conflict', existing: null })
  })

  it('rethrows non-conflict insert errors', async () => {
    const subject = await createTestUser()

    await expect(createDataRequestOrConflict(subject.id, randomUUID())).rejects.toMatchObject({
      code: '23503',
    })
  })
})
