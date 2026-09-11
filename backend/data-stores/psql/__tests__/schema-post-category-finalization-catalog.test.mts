import { describe, expect, it } from 'vitest'
import { read } from '@data-stores/psql'

describe('post category finalization schema catalog', () => {
  it('contains only the steady-state repair trigger', async () => {
    const { rows } = await read<{
      allocator_function_exists: boolean
      allocator_sequence_exists: boolean
      allocator_trigger_exists: boolean
      repair_function_exists: boolean
      repair_trigger_exists: boolean
    }>(`/* getPostCategoryFinalizationCatalog */
      SELECT
        to_regclass('public.post_category_finalization_generation_seq') IS NOT NULL
          AS allocator_sequence_exists,
        to_regprocedure('public.allocate_post_category_finalization_generation()') IS NOT NULL
          AS allocator_function_exists,
        EXISTS (
          SELECT 1
          FROM pg_trigger trigger_definition
          WHERE trigger_definition.tgrelid = 'post_category_finalizations'::regclass
            AND trigger_definition.tgname = 'post_category_finalizations_allocate_generation'
            AND NOT trigger_definition.tgisinternal
        ) AS allocator_trigger_exists,
        to_regprocedure(
          'public.repair_post_category_finalization_admission_response_on_delete()'
        ) IS NOT NULL AS repair_function_exists,
        EXISTS (
          SELECT 1
          FROM pg_trigger trigger_definition
          WHERE trigger_definition.tgrelid = 'post_category_finalizations'::regclass
            AND trigger_definition.tgname = 'post_category_finalizations_repair_admission_response_on_delete'
            AND NOT trigger_definition.tgisinternal
        ) AS repair_trigger_exists`)

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
