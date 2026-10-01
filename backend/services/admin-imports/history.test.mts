import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  readStaffActionHistory,
  withRejectedStaffActionHistory,
} from '@voucha/test-helpers/staff-action-history'
import { readStaffEditorialRows } from '@voucha/test-helpers/staff-editorial-history'
import { createImportBatch } from './create-batch.mts'

describe('admin-imports staff history', () => {
  it('atomically records staff topic-import batches', async () => {
    const actor = await createTestUser({ administrator: true })
    const input = [{ slug: `import-${crypto.randomUUID()}`, name: 'Synthetic topic' }]
    await expect(
      withRejectedStaffActionHistory(actor.id, () => createImportBatch(actor, 'topic', input)),
    ).rejects.toThrow('staff history rejected')
    expect((await readStaffEditorialRows(actor.id)).batches).toEqual([])
    expect(await readStaffActionHistory(actor.id)).toEqual([])
    await createImportBatch(actor, 'topic', input)
    expect((await readStaffActionHistory(actor.id))[0]).toMatchObject({
      action_type: 'import_batch_create',
      metadata: { after: { import_type: 'topic', total_rows: 1 } },
    })
  })
})
