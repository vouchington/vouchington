import { afterAll, describe, expect, it } from 'vitest'
import { onGracefulShutdown, read } from '../index.mts'

describe('post admission reservation indexes', () => {
  afterAll(onGracefulShutdown)

  it('indexes committed admission replay records by their retained post ID', async () => {
    const { rows } = await read<{ indexdef: string }>(
      `/* getCommittedAdmissionPostIndex */
        SELECT indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'post_admission_reservations'
          AND indexname = 'idx_post_admission_reservations__committed_post_retention'
        LIMIT 1`,
    )

    expect(rows).toEqual([
      {
        indexdef:
          "CREATE INDEX idx_post_admission_reservations__committed_post_retention ON public.post_admission_reservations USING btree (committed_post_id, retention_expires_at) WHERE (state = 'committed'::text)",
      },
    ])
  })
})
