import { write } from '@data-stores/psql'
import {
  claimClassifierRun,
  completeClassifierRun,
  persistClassifierRunOutcomes,
  requestClassifierRuns,
  reserveClassifierRun,
  type ReservedClassifierRun,
} from '../../../../services/classifier-runs/index.mts'
import { markClassifierRunTerminalForTest } from './run-facts.mts'
import {
  createSyntheticPost,
  type SyntheticFixture,
  type SyntheticPost,
} from './synthetic-classifier.mts'

export function requestSyntheticRun(
  setup: SyntheticFixture,
  inputSha256 = setup.post.inputSha256,
  classifierSlugs: readonly string[] = [setup.slug],
) {
  return requestClassifierRuns(write, {
    subject: setup.subject,
    inputSha256,
    classifierSlugs,
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

/** The same synthetic classifier over another approved post. */
export function overSyntheticPost(setup: SyntheticFixture, post: SyntheticPost): SyntheticFixture {
  return { ...setup, post, subject: { postId: post.id, rssFeedItemId: null } }
}

export async function overNewSyntheticPost(setup: SyntheticFixture): Promise<SyntheticFixture> {
  return overSyntheticPost(setup, await createSyntheticPost())
}

/** Reserves a run over a new post and ends it as a terminal failure of `kind`. */
export async function reserveEndedSyntheticRun(
  setup: SyntheticFixture,
  kind: string,
): Promise<ReservedClassifierRun> {
  const run = await reserveSyntheticRun(await overNewSyntheticPost(setup))
  await markClassifierRunTerminalForTest(run.runId, kind)
  return run
}

/** Reserves a run over a new post and takes it through to completion. */
export async function reserveCompletedSyntheticRun(setup: SyntheticFixture): Promise<void> {
  const { lease } = await leaseSyntheticRun(await overNewSyntheticPost(setup))
  await persistClassifierRunOutcomes(setup.adapter, { lease })
  await completeClassifierRun(setup.adapter, lease)
}
