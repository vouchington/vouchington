import { describe, expect, it } from 'vitest'
import {
  OwnedUrlDeleteBatchError,
  OwnedUrlDeleteCapError,
  READMISSION_URL_DELETE_BATCH_ROWS,
  deleteOwnedUrlsInBatches,
  type OwnedUrlDelete,
} from './hacker-news-readmission-cleanup.mts'

const HOSTNAME_ID = '019e0000-0200-7000-8000-000000097070'

function deletingQuery(totalRows: number): { query: OwnedUrlDelete; limits: number[] } {
  let remaining = totalRows
  const limits: number[] = []
  const query: OwnedUrlDelete = async (_text, values) => {
    const limit = values[1]
    if (typeof limit !== 'number') throw new Error('cleanup limit must be a number')
    limits.push(limit)
    const deleted = Math.min(remaining, limit)
    remaining -= deleted
    return { rowCount: deleted }
  }
  return { query, limits }
}

describe('deleteOwnedUrlsInBatches', () => {
  it('deletes the 100k fixture in statements at or under the batch limit', async () => {
    const totalRows = 100_000
    const { query, limits } = deletingQuery(totalRows)
    await deleteOwnedUrlsInBatches(query, HOSTNAME_ID, totalRows)

    expect(limits.length).toBeGreaterThan(1)
    expect(Math.max(...limits)).toBeLessThanOrEqual(READMISSION_URL_DELETE_BATCH_ROWS)
    expect(limits.reduce((sum, limit) => sum + limit, 0)).toBeGreaterThanOrEqual(totalRows)
  })

  it('names the batch limit when a delete statement hits statement_timeout', async () => {
    const timeout = Object.assign(new Error('canceling statement due to statement timeout'), {
      code: '57014',
    })
    const query: OwnedUrlDelete = async () => {
      throw timeout
    }

    await expect(deleteOwnedUrlsInBatches(query, HOSTNAME_ID, 100_000)).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof OwnedUrlDeleteBatchError &&
        error.limit === READMISSION_URL_DELETE_BATCH_ROWS &&
        error.statementCode === '57014' &&
        error.cause === timeout,
    )
  })

  it('stops after the fixture cap instead of deleting an unbounded remainder', async () => {
    const query: OwnedUrlDelete = async () => ({ rowCount: READMISSION_URL_DELETE_BATCH_ROWS })

    await expect(deleteOwnedUrlsInBatches(query, HOSTNAME_ID, 100_000)).rejects.toBeInstanceOf(
      OwnedUrlDeleteCapError,
    )
  })
})
