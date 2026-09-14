import { describe, expect, it } from 'vitest'
import { getPostCategoryFinalizationCatalog } from '../../../test-helpers/data-stores/psql/post-category-finalization-catalog.mts'

describe('post category finalization schema catalog', () => {
  it('contains only the steady-state repair trigger', async () => {
    const rows = await getPostCategoryFinalizationCatalog()

    expect(rows).toEqual([
      {
        allocator_function_exists: false,
        allocator_sequence_exists: false,
        allocator_trigger_exists: false,
        repair_function_exists: true,
        repair_trigger_exists: true,
      },
    ])
  })
})
