import { write } from '@data-stores/psql'
import { runAndCapture, seedPostId } from '../run-support.mts'
import { refreshContributionAdmissionPostResponses } from '../run-services.mts'

export async function runAdmissionReservationScenarios(): Promise<void> {
  const { rows } = await write<{ generation: string }>(
    `/* getExplainAdmissionResponseFinalizationGeneration */
      SELECT generation
      FROM post_category_finalizations
      WHERE post_id = $1`,
    [seedPostId],
  )
  const generation = rows[0]?.generation
  if (!generation) throw new Error('Seed admission response finalization was not found')

  await runAndCapture('post-admission-response-refresh', () =>
    refreshContributionAdmissionPostResponses(seedPostId, generation),
  )
}
