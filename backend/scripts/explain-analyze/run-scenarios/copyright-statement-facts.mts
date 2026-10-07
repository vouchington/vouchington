import { beginTransaction, read } from '@data-stores/psql'
import { selectCopyrightStatementFacts } from '@services/copyright-notices/statement-of-reasons-facts'
import { runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'

/**
 * The development seed (`backend/scripts/seeds/dev-seed.mts`, which the EXPLAIN workflow runs
 * first) files a notice against one hosted post image. Its target is the statement facts query's
 * `target` row: the query has to decide from that one placement whether a public page exists.
 */
export async function runCopyrightStatementFactsScenarios(): Promise<void> {
  const { rows } = await read<{ notice_id: string; target_id: string }>(
    `/* findCopyrightStatementFactsTarget */
    SELECT target.copyright_notice_id AS notice_id, target.id AS target_id
    FROM copyright_notice_targets target
    JOIN image_placements binding ON binding.placement_id = target.placement_id
    ORDER BY target.id
    LIMIT 1`,
  )
  const seeded = rows[0]
  if (!seeded) {
    throw new Error(
      'The copyright statement facts scenario needs the development seed notice; run backend/scripts/seeds/dev-seed.mts before the EXPLAIN seed',
    )
  }
  registerScenarioContract('copyright-statement-facts', {
    expectations: [
      { kind: 'custom', name: 'copyrightFacts' },
      { kind: 'maxProcessedRows', relation: 'posts', max: 10 },
    ],
  })
  await runAndCapture(
    'copyright-statement-facts',
    async () => {
      await using transaction = await beginTransaction()
      const facts = await selectCopyrightStatementFacts(seeded.notice_id, transaction, {
        targetId: seeded.target_id,
      })
      await transaction.rollback()
      if (facts.targetUrls.length !== 1) {
        throw new Error('Expected the seeded post-image target to have a public page')
      }
    },
    undefined,
    'selectCopyrightStatementFacts',
  )
}
