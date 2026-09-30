import { write } from '@data-stores/psql'
import {
  claimClassifierRun,
  requestClassifierRuns,
  reserveClassifierRun,
  type ReservedClassifierRun,
} from '../../../../services/classifier-runs/index.mts'
import type { SyntheticFixture } from './synthetic-classifier.mts'

export function requestSyntheticRun(setup: SyntheticFixture, inputSha256 = setup.post.inputSha256) {
  return requestClassifierRuns(write, {
    subject: setup.subject,
    inputSha256,
    classifierSlugs: [setup.slug],
  })
}

export async function reserveSyntheticRun(setup: SyntheticFixture): Promise<ReservedClassifierRun> {
  const reserved = await reserveClassifierRun(setup.adapter, setup.subject)
  if (reserved.kind !== 'reserved') throw new Error(`Unexpected reservation: ${reserved.kind}`)
  return reserved.run
}

export function claimSyntheticRun(
  setup: SyntheticFixture,
  run: ReservedClassifierRun,
  leaseSeconds = 60,
) {
  return claimClassifierRun(setup.adapter, {
    runId: run.runId,
    subject: run.subject,
    inputSha256: run.inputSha256,
    configurationSha256: run.configurationSha256,
    leaseSeconds,
  })
}

/** Reserves the synthetic run and takes its first lease. */
export async function leaseSyntheticRun(setup: SyntheticFixture) {
  const run = await reserveSyntheticRun(setup)
  const claim = await claimSyntheticRun(setup, run)
  if (claim.kind !== 'claimed') throw new Error(`Unexpected claim: ${claim.kind}`)
  return { run, lease: claim.lease }
}
