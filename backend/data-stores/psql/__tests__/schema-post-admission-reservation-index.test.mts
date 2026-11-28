import { onGracefulShutdown } from '@data-stores/graceful-shutdown'
import { afterAll, describe, expect, it } from 'vitest'
import { readPublicIndexDefinition } from '../../../test-helpers/data-stores/psql/schema-catalog.mts'

describe('post admission reservation indexes', () => {
  afterAll(() => onGracefulShutdown('SIGTERM'))

  it('indexes committed admission replay records by their retained post ID', async () => {
    const rows = await readPublicIndexDefinition(
      'post_admission_reservations',
      'idx_post_admission_reservations__committed_post_retention',
    )

    expect(rows).toEqual([
      {
        indexdef:
          'CREATE INDEX idx_post_admission_reservations__committed_post_retention ON public.post_admission_reservations USING btree (committed_post_id, retention_expires_at) WHERE (committed_post_id IS NOT NULL)',
      },
    ])
  })
})
