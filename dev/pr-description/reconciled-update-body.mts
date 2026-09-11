import { reconcileShepherdJournal, type ShepherdJournalReconcileResult } from 'pr-shepherd/journal'
import { runGh } from 'vouchington-tooling/gh-cli'

import { resolveBody } from './body-source.mts'

export async function resolveReconciledUpdateBody(
  bodyFile: string | undefined,
  pr: string,
): Promise<ShepherdJournalReconcileResult> {
  const { body, source } = await resolveBody({ bodyFile, pr })
  if (source === 'pr') return { body, ok: true }

  const parsed = JSON.parse(await runGh(['pr', 'view', pr, '--json', 'body'])) as {
    body: string | null
  }
  return reconcileShepherdJournal(body, parsed.body ?? '')
}
