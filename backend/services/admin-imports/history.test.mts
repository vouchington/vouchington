import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { readStaffActionHistory } from '@voucha/test-helpers/staff-action-history'
import { rejectPostgresWriteForTest } from '@voucha/test-helpers/injected-failures'
import { readStaffEditorialRows } from '@voucha/test-helpers/staff-editorial-history'
import { createImportBatch } from './create-batch.mts'

describe('admin-imports staff history', () => {
  it('atomically records staff topic-import batches', async () => {
    const actor = await createTestUser({ administrator: true })
    const input = [{ slug: `import-${crypto.randomUUID()}`, name: 'Synthetic topic' }]
    const restore = rejectPostgresWriteForTest(
      '/* recordModeratorAction',
      new Error('staff history rejected for test'),
      values => values.some(value => typeof value === 'string' && value.includes(actor.id)),
    )
    try {
      await expect(createImportBatch(actor, 'topic', input)).rejects.toThrow(
        'staff history rejected',
      )
    } finally {
      restore()
    }
    expect((await readStaffEditorialRows(actor.id)).batches).toEqual([])
    expect(await readStaffActionHistory(actor.id)).toEqual([])
    await createImportBatch(actor, 'topic', input)
    expect((await readStaffActionHistory(actor.id))[0]).toMatchObject({
      action_type: 'import_batch_create',
      metadata: { after: { import_type: 'topic', total_rows: 1 } },
    })
  })
})
