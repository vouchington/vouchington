import { write } from '@data-stores/psql'
import {
  claimClassifierRun,
  readClassifierUsageReport,
  requestClassifierRuns,
  type ClassifierRunSubject,
  type ClassifierUsageReport,
  type ReservedClassifierRun,
} from '../services/classifier-runs/index.mts'
import type { ClassifierRunExecution } from '../agents/classifier-runs/index.mts'
import {
  toClassifierRunJobData,
  type ClassifierRunRegistration,
} from '../workers/ai-agents/processors/classifier-run-handler.mts'
import { getClassifierRunHandler } from '../workers/ai-agents/processors/classifier-run-registry.mts'
import { processClassifierRun } from '../workers/ai-agents/processors/process-classifier-run.mts'
import { classifierRunJobFor } from './classifier-run-worker.mts'

/** One content version of one scope, seeded with the work its classifier fans out over. */
export type EfficiencySeed = {
  subject: ClassifierRunSubject
  inputSha256: Buffer
  /** What the receipt captured: community rules, topics, neighbor items or toggled questions. */
  candidates: number
  /** What the run applied (votes, tags, projections, story joins), for a replay to leave alone. */
  effects(): Promise<unknown>
  /** Adds a candidate after reservation, as a later embedding search would (C6 topics, C9 items). */
  addCandidate?(): Promise<void>
}

/** The most one seeded content version may show in the report: one billed call, nothing repeated. */
export const ONE_BILLED_CALL = {
  runs: 1,
  billedRuns: 1,
  reclassifications: 0,
  retries: 0,
  providerCalls: 1,
  persistedDecisionCalls: 1,
  maxProviderCallsPerRun: 1,
  runsOverOneCall: 0,
  costMicrounits: '2000',
  latencySamples: 1,
} as const

export type EfficiencyDriver = {
  slug: string
  /** Names the scope in test titles. */
  scope: string
  /**
   * The candidate counts a content version is seeded with: one, and a large one (the scope's
   * default maximum, or the cap it enforces when it has one).
   */
  fanOuts: readonly [number, number]
  /** How many questions the one call carries for a seed of `fanOut` candidates. */
  questions(fanOut: number): number
  /** Whether the candidate set is captured outside the receipt identity, so it can change later. */
  lateCandidates?: true
  /** Prepares the shared state the scope needs (C5's seeded config) and returns its release. */
  initialize?(): Promise<() => Promise<void>>
  seed(fanOut: number): Promise<EfficiencySeed>
  /** Runs the leased run up to its persisted outcomes, then stops before completing it. */
  executeWithoutCompleting(run: ReservedClassifierRun): Promise<ClassifierRunExecution>
}

/** The durable request approval or the upsert writes, then the reservation the dispatcher makes. */
export async function reserveSeededRun(
  slug: string,
  seed: Pick<EfficiencySeed, 'subject' | 'inputSha256'>,
): Promise<ReservedClassifierRun> {
  await requestClassifierRuns(write, {
    subject: seed.subject,
    inputSha256: seed.inputSha256,
    classifierSlugs: [slug],
  })
  const reserved = await getClassifierRunHandler(slug).reserve(seed.subject)
  if (reserved.kind !== 'reserved') throw new Error(`Expected a reservation, got ${reserved.kind}`)
  return reserved.run
}

/** One queue delivery of the run, through the same worker path production uses. */
export async function deliverRun(slug: string, run: ReservedClassifierRun): Promise<string> {
  const result = await processClassifierRun(classifierRunJobFor(toClassifierRunJobData(slug, run)))
  return result.kind
}

/** Claims the run and executes it through the registration, leaving it persisted but not completed. */
export async function executeLeasedRun<C, L, E>(
  registration: ClassifierRunRegistration<C, L, E>,
  run: ReservedClassifierRun,
  maxAttempts: number,
): Promise<ClassifierRunExecution> {
  const claim = await claimClassifierRun(registration.adapter, {
    runId: run.runId,
    subject: run.subject,
    inputSha256: run.inputSha256,
    configurationSha256: run.configurationSha256,
    leaseSeconds: 60,
  })
  if (claim.kind !== 'claimed') throw new Error(`Expected a claim, got ${claim.kind}`)
  return registration.execute(claim.lease, { maxAttempts, signal: AbortSignal.timeout(30_000) })
}

/**
 * The window that holds every run a scenario reserves. Run ids are database UUIDv7s, so it is
 * read from the real clock: take it before `withReservedAiUsageDay` fakes `Date` into its day.
 */
export function efficiencyWindow(): { from: Date; to: Date } {
  const now = Date.now()
  return { from: new Date(now - 120_000), to: new Date(now + 600_000) }
}

/**
 * What the usage report says about one seeded content version, and nothing about the rest: parallel
 * test files share the database, so the classifier-wide totals are never asserted on.
 */
export async function reportedContentVersion(
  window: ClassifierUsageReport['window'],
  slug: string,
  seed: Pick<EfficiencySeed, 'subject' | 'inputSha256'>,
) {
  const report = await readClassifierUsageReport(window)
  const subjectId = seed.subject.postId ?? seed.subject.rssFeedItemId
  const inputSha256 = seed.inputSha256.toString('hex')
  const own = { classifier: slug, subjectId, inputSha256 }
  return {
    version: report.contentVersions.find(
      version =>
        version.classifier === own.classifier &&
        version.subjectId === own.subjectId &&
        version.inputSha256 === own.inputSha256,
    ),
    runs: report.runs.filter(
      run =>
        run.classifier === own.classifier &&
        run.subjectId === own.subjectId &&
        run.inputSha256 === own.inputSha256,
    ),
  }
}
