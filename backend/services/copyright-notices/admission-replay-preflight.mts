import { beginTransaction } from '@data-stores/psql'
import { CopyrightReplayAdmission } from './replay-admission.mts'
import {
  findCopyrightReplayIdentity,
  type CopyrightReplayResult,
} from './replay-identity-store.mts'
import type { CopyrightReplayInput } from './replay-admission-locks.mts'

/** Commit/release lookup before independent data-key reservation; expired authorized replay is touched too. */
export async function preflightCopyrightReplay(
  input: CopyrightReplayInput,
): Promise<CopyrightReplayResult | null> {
  await using query = await beginTransaction()
  const admission = await CopyrightReplayAdmission.open(query, input)
  const candidate = await findCopyrightReplayIdentity(admission)
  const result = candidate ? await candidate.replay() : null
  await query.commit()
  return result
}
