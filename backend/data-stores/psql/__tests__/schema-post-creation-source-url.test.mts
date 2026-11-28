import { onGracefulShutdown } from '@data-stores/graceful-shutdown'
import { afterAll, describe, expect, it } from 'vitest'
import { readPublicTriggerDefinition } from '../../../test-helpers/data-stores/psql/schema-catalog.mts'

describe('post creation source URL schema', () => {
  afterAll(async () => {
    await onGracefulShutdown('SIGTERM')
  })

  it('keeps the original source URL immutable', async () => {
    const rows = await readPublicTriggerDefinition(
      'posts',
      'trigger_posts_creation_source_url_id_immutable',
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]!.definition).toContain('BEFORE UPDATE OF creation_source_url_id')
    expect(rows[0]!.definition).toContain('fn_reject_mutation()')
    expect(rows[0]!.definition).toContain('old.creation_source_url_id')
    expect(rows[0]!.definition).toContain('new.creation_source_url_id')
    expect(rows[0]!.definition).toContain('IS DISTINCT FROM')
    expect(rows[0]!.function_definition).toContain('rows are append-only')
  })
})
