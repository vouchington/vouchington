import { read } from '@data-stores/psql'

export type PostCategoryFinalizationCatalog = {
  allocator_function_exists: boolean
  allocator_sequence_exists: boolean
  allocator_trigger_exists: boolean
  repair_function_exists: boolean
  repair_trigger_exists: boolean
}

export async function getPostCategoryFinalizationCatalog(): Promise<
  PostCategoryFinalizationCatalog[]
> {
  const { rows } = await read<PostCategoryFinalizationCatalog>(
    `/* getPostCategoryFinalizationCatalog */ SELECT to_regclass('public.post_category_finalization_generation_seq') IS NOT NULL AS allocator_sequence_exists, to_regprocedure('public.allocate_post_category_finalization_generation()') IS NOT NULL AS allocator_function_exists, EXISTS (SELECT 1 FROM pg_trigger trigger_definition WHERE trigger_definition.tgrelid = 'post_category_finalizations'::regclass AND trigger_definition.tgname = 'post_category_finalizations_allocate_generation' AND NOT trigger_definition.tgisinternal) AS allocator_trigger_exists, to_regprocedure('public.repair_post_category_finalization_admission_response_on_delete()') IS NOT NULL AS repair_function_exists, EXISTS (SELECT 1 FROM pg_trigger trigger_definition WHERE trigger_definition.tgrelid = 'post_category_finalizations'::regclass AND trigger_definition.tgname = 'post_category_finalizations_repair_admission_response_on_delete' AND NOT trigger_definition.tgisinternal) AS repair_trigger_exists`,
  )
  return rows
}
