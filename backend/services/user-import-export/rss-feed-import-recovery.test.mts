import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import {
  createStaleRssFeedImportBatchForTest,
  deleteStaleRssFeedImportBatchForTest,
} from '@voucha/test-helpers/rss-feed-import-batches'
import { getRssFeedImportRowIds } from '@voucha/test-helpers/rss-feed-import-rows'
import type { PrivateUser } from '@services/users/types'
import { updateRssFeedImportRowFailed } from './rss-feed-import-row-updates.mts'
import { createRssFeedImport } from './rss-feed-import-records.mts'
import { recoverStalledUserRssFeedImports } from './rss-feed-import-recovery.mts'
import { getRssFeedImportSummary } from './rss-feed-import-status.mts'

// The shared database may hold other tests' unfinished imports, so each case looks only at calls
// for the import it owns.
function callsFor(enqueue: ReturnType<typeof vi.fn>, id: string): number {
  return enqueue.mock.calls.filter(([called]) => (called as string[]).includes(id)).length
}

describe('stalled user RSS feed import recovery', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('re-dispatches a stalled import once, then leaves it alone until it stalls again', async () => {
    const importId = await createStaleRssFeedImportBatchForTest(
      user.id,
      `https://recover-${randomUUID()}.example.com/feed`,
    )
    onTestFinished(() => deleteStaleRssFeedImportBatchForTest(user.id, importId))
    const enqueueDispatches = vi.fn<(ids: string[]) => Promise<undefined>>(async () => undefined)

    await recoverStalledUserRssFeedImports({ staleAfterMs: 1, enqueueDispatches })
    await recoverStalledUserRssFeedImports({ enqueueDispatches })

    expect(callsFor(enqueueDispatches, importId)).toBe(1)
  })

  it('does not re-dispatch an import that finished', async () => {
    const created = await createRssFeedImport(
      user.id,
      WEB_PROVENANCE,
      [`https://recover-done-${randomUUID()}.example.com/feed`],
      false,
    )
    const [rowId] = await getRssFeedImportRowIds(created.import.id)
    await updateRssFeedImportRowFailed(rowId!, 'No feed found', { isFinalAttempt: true })
    const enqueueDispatches = vi.fn<(ids: string[]) => Promise<undefined>>(async () => undefined)

    await recoverStalledUserRssFeedImports({ staleAfterMs: 0, enqueueDispatches })

    expect(callsFor(enqueueDispatches, created.import.id)).toBe(0)
  })

  it('fills in a completion marker missed after the final row committed', async () => {
    const importId = await createStaleRssFeedImportBatchForTest(
      user.id,
      `https://recover-terminal-${randomUUID()}.example.com/feed`,
      true,
    )
    onTestFinished(() => deleteStaleRssFeedImportBatchForTest(user.id, importId))
    const enqueueDispatches = vi.fn<(ids: string[]) => Promise<undefined>>(async () => undefined)

    await recoverStalledUserRssFeedImports({ staleAfterMs: 1, enqueueDispatches })

    expect(await getRssFeedImportSummary(user.id, importId)).toMatchObject({
      failed_rows: 1,
      skipped_rows: 1,
      pending_rows: 0,
      completed_at: expect.any(Date),
    })
    expect(callsFor(enqueueDispatches, importId)).toBe(0)
  })
})
