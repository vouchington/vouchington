import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { seedUuid } from '../seed-data/common.mts'

/** Seed independent owner cutoffs so point probes are planned against a representative relation. */
export async function withSessionCutoffCorpus(run: () => Promise<void>): Promise<void> {
  const ids = Array.from({ length: 4_000 }, (_, index) => seedUuid(index + 100, '01'))
  const inserted = await write<{ user_id: string }>(
    `/* seedSessionCutoffCorpus */ INSERT INTO user_session_revocation_cutoffs (user_id, cutoff_at)
     SELECT id, to_timestamp(0) FROM unnest($1::uuid[]) AS input(id)
     ON CONFLICT (user_id) DO NOTHING RETURNING user_id`,
    [ids],
  )
  try {
    assert.equal(inserted.rows.length, ids.length, 'Cutoff corpus owner IDs must be unused')
    await write('/* analyzeSessionCutoffCorpus */ ANALYZE user_session_revocation_cutoffs')
    await write('/* analyzeSessionLimitCorpus */ ANALYZE user_sessions')
    await run()
  } finally {
    await write(
      '/* cleanupSessionCutoffCorpus */ DELETE FROM user_session_revocation_cutoffs WHERE user_id = ANY($1::uuid[])',
      [inserted.rows.map(row => row.user_id)],
    )
    await write('/* vacuumSessionCutoffCorpus */ VACUUM (ANALYZE) user_session_revocation_cutoffs')
  }
}
