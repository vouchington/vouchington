import type { CopyrightCasePurgeJobData } from '../../queues/psql/types.mts'

/** A phase boundary cannot carry an ancestor, object, or keyset cursor forward. */
export function enterCopyrightCasePurgePhase(
  data: CopyrightCasePurgeJobData,
  phase: CopyrightCasePurgeJobData['phase'],
): CopyrightCasePurgeJobData {
  return {
    ...data,
    phase,
    phaseIndex: 0,
    afterId: null,
    childFrames: undefined,
    evidenceOwner: undefined,
  }
}
