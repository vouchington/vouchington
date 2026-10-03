import type { ClassifierRunUsage } from '../services/classifier-runs/usage-report-types.mts'

/** One completed, single-call post classifier run: the shape every report summary test varies. */
const COMPLETED_RUN: ClassifierRunUsage = {
  runId: 'run',
  classifier: 'post-classifier',
  primitive: 'noul',
  subjectKind: 'post',
  subjectId: 'post',
  inputSha256: 'aa',
  configurationSha256: 'bb',
  communityIdentityId: null,
  batchId: 'batch',
  promptVersionId: 'prompt-1',
  provider: 'TypeSafe',
  model: 'typesafe/jev-1.13',
  scopeCategory: 'global',
  scopeCommunityId: null,
  shardCount: 1,
  candidateCount: 3,
  outcome: 'completed',
  outcomesPersisted: true,
  attemptsStarted: 1,
  retries: 0,
  sweepEnqueues: 0,
  providerCalls: 1,
  attemptsWithoutRecordedResponse: 0,
  inputTokens: 100,
  cachedInputTokens: 40,
  outputTokens: 10,
  pricedCalls: 1,
  unpricedCalls: 0,
  costMicrounits: '2000',
  latencyMsTotal: 200,
  latencyMsMax: 200,
  latencySamples: 1,
  localDetector: null,
}

export function classifierRunUsage(
  overrides: Partial<ClassifierRunUsage> = {},
): ClassifierRunUsage {
  return { ...COMPLETED_RUN, ...overrides }
}
