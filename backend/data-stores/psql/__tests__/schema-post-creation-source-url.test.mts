import { afterAll, describe, expect, it } from 'vitest'
import { onGracefulShutdown, read } from '../index.mts'

describe('post creation source URL schema', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('keeps the original source URL immutable', async () => {
    const { rows } = await read<{ definition: string; function_definition: string }>(`
      /* getPostCreationSourceUrlTrigger */
      SELECT
        pg_get_triggerdef(trigger_definition.oid) AS definition,
        pg_get_functiondef(trigger_definition.tgfoid) AS function_definition
      FROM pg_trigger trigger_definition
      WHERE trigger_definition.tgrelid = 'posts'::regclass
        AND trigger_definition.tgname = 'trigger_posts_creation_source_url_id_immutable'
        AND NOT trigger_definition.tgisinternal
    `)

    expect(rows).toHaveLength(1)
    expect(rows[0]!.definition).toContain('BEFORE UPDATE OF creation_source_url_id')
    expect(rows[0]!.definition).toContain('fn_reject_mutation()')
    expect(rows[0]!.definition).toContain('old.creation_source_url_id')
    expect(rows[0]!.definition).toContain('new.creation_source_url_id')
    expect(rows[0]!.definition).toContain('IS DISTINCT FROM')
    expect(rows[0]!.function_definition).toContain('rows are append-only')
  })
})
