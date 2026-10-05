import { classifierPlanIsolatedCases } from './vitest-isolated-database-classifier-plan-cases.mts'
import { copyrightReportIsolatedCases } from './vitest-isolated-database-copyright-report-cases.mts'
import { workerSweepIsolatedCases } from './vitest-isolated-database-worker-cases.mts'
type IsolatedDatabaseCaseDefinition = { file: string; fullName: `${string} > ${string}` }

const isolatedDatabaseCases = {
  ...copyrightReportIsolatedCases,
  ...workerSweepIsolatedCases,
  ...classifierPlanIsolatedCases,
  'openai-moderation-reconciliation': {
    file: 'backend/workers/openai-moderation/workers/__tests__/workers.test.mts',
    fullName:
      'openai moderation single worker > requeues due source work and moves deadline-exhausted posts to review',
  },
  'semantic-post-window-cap': {
    file: 'backend/services/posts/search/__tests__/get-ids.semantic-window.test.mts',
    fullName:
      'semantic search candidate paging > ends pagination at the fixed window and counts the same candidates',
  },
  'semantic-post-window-selective': {
    file: 'backend/services/posts/search/__tests__/get-ids.semantic-window.test.mts',
    fullName:
      'semantic search candidate paging > fills a selective page and preserves distance ranking for semantic and hybrid queries',
  },

  'retained-relation-cursors': {
    file: 'backend/services/data-retention/__tests__/relation-cleanup-cursors.test.mts',
    fullName:
      'retained relation cleanup cursors > creates all missing cursors and reuses them on replay',
  },
  'media-replay': {
    file: 'backend/api/v1/copyright-notices/copyright-notices.replay.isolated.test.mts',
    fullName:
      'isolated global media replay route > replays failed media registry records only for review staff and writes one audit event',
  },
  'activitypub-expiry': {
    file: 'backend/services/ap-inbox-activities/durable-delivery-storage.test.mts',
    fullName:
      'ActivityPub inbox durable storage bounds > deletes expired rows in deterministic lease-aware locked batches',
  },
  'copyright-territorial-withdrawal': {
    file: 'backend/services/copyright-notices/territorial-withdrawal.isolated.test.mts',
    fullName:
      'territorial approval withdrawal keeps received-case duties > gates new EU and UK intake while pending and decided notices continue',
  },
  'copyright-dsa-report-withdrawn-approval': {
    file: 'backend/api/v1/copyright-notices/eu-copyright-report-route.test.mts',
    fullName:
      'DSA copyright transparency report GET > counts a receipt after withdrawing its approval and does not persist GET output',
  },
  'copyright-eu-transparency-report': {
    file: 'backend/services/copyright-notices/eu-copyright-contract.test.mts',
    fullName:
      'EU copyright notice contracts > requires a staff statement before redress and reports only stored facts',
  },
  'copyright-staff-email-intakes': {
    file: 'backend/services/copyright-notices/email-intakes-staff-queue.test.mts',
    fullName:
      'searchCopyrightStaffEmailIntakes > hides the queue from non-reviewers and lists unreviewed intakes, parsed or not, for staff',
  },
  'copyright-staff-email-intake-reply-failures': {
    file: 'backend/services/copyright-notices/email-intakes-staff-queue-reply-failures.test.mts',
    fullName:
      'copyright email intake queue reply failures > lists a declined intake whose reply failed or bounced with its reason and wait, and hides the rest',
  },
  'copyright-email-legal-process-queue': {
    file: 'backend/services/copyright-notices/email-legal-process-queue.test.mts',
    fullName:
      'copyright email legal process queue > removes a legal-process intake from the staff email queue and keeps the undecided ones',
  },
  'copyright-email-queue-exact-limit': {
    file: 'backend/api/v1/copyright-notices/email-intake-queue-pagination.test.mts',
    fullName:
      'copyright email intake queue pagination > ends on an exact-limit final page with no next cursor',
  },
  'copyright-email-queue-partial': {
    file: 'backend/api/v1/copyright-notices/email-intake-queue-pagination.test.mts',
    fullName: 'copyright email intake queue pagination > ends on a partial final page',
  },
  'copyright-email-queue-walk': {
    file: 'backend/api/v1/copyright-notices/email-intake-queue-pagination.test.mts',
    fullName:
      'copyright email intake queue pagination > walks every owned intake one page at a time without repeats',
  },
  'copyright-email-queue-tie': {
    file: 'backend/api/v1/copyright-notices/email-intake-queue-pagination.test.mts',
    fullName:
      'copyright email intake queue pagination > uses the UUID tie-breaker when two intakes share a received timestamp',
  },
  'copyright-staff-queue-urgency': {
    file: 'backend/api/v1/copyright-notices/staff-queue-urgency.test.mts',
    fullName:
      'copyright staff queue urgency > lists missed then due restoration deadlines ahead of older intake work across pages',
  },
  'copyright-trusted-flagger-priority': {
    file: 'backend/api/v1/copyright-notices/trusted-flagger-staff-queue.test.mts',
    fullName:
      'trusted-flagger staff queue priority > boosts only in-area EU matches within urgency tiers and pages with the new cursor',
  },
  'copyright-dev-seed': {
    file: 'backend/scripts/seed/copyright.test.mts',
    // Joined with ' > ' because that is what Vitest 5 matches.
    fullName:
      'seedCopyright > fills both staff queues with every review state and adds nothing when run again',
  },
  'copyright-cache-policy': {
    file: 'backend/api/v1/copyright-notices/copyright-cache.test.mts',
    fullName:
      'copyright API cache policy > marks member, staff, and raw-email responses private and no-store',
  },
  'staging-rss-feed-publisher-type': {
    file: 'backend/data-stores/psql/config-driven/__tests__/0080-00-01a-staging-rss-feeds.bootstrap.test.mts',
    fullName:
      'staging RSS feed seed on a fresh bootstrap > gives the Cloudflare topic its blog publisher type in one bootstrap pass',
  },
  'embedding-creation-fairness': {
    file: 'backend/workers/bedrock-embeddings-batch/processors/creation.real-glide.mock.test.mts',
    fullName:
      'same-job embedding continuation > yields an image capacity delay to text work while preserving the global creation cap',
  },
  'embedding-reconciliation-router': {
    file: 'backend/workers/bedrock-embeddings-batch/__tests__/worker-router.test.mts',
    fullName:
      'bedrock embeddings batch worker processor > reconciles a cached topic even when Bedrock creation is saturated',
  },
} as const satisfies Record<string, IsolatedDatabaseCaseDefinition>

export type IsolatedDatabaseCaseId = keyof typeof isolatedDatabaseCases

type ChildEnvironment = Partial<
  Pick<
    NodeJS.ProcessEnv,
    | 'VITEST_ISOLATED_DATABASE_CASE'
    | 'VITEST_ISOLATED_DATABASE_CHILD'
    | 'DATABASE_URL'
    | 'READ_DATABASE_URL'
  >
>

const databaseNamePattern = /^voucha_scope_case_[0-9a-f]{24}$/

export function makeIsolatedDatabaseName(suffix: string): string {
  if (!/^[0-9a-f]{24}$/.test(suffix)) throw new Error('Invalid isolated database suffix')
  return `voucha_scope_case_${suffix}`
}

export function getIsolatedDatabaseCase(caseId: string) {
  if (!Object.hasOwn(isolatedDatabaseCases, caseId)) {
    throw new Error(`Unknown isolated database case: ${caseId}`)
  }
  return isolatedDatabaseCases[caseId as IsolatedDatabaseCaseId]
}

export function isolatedTestNamePattern(caseId: IsolatedDatabaseCaseId): string {
  const { fullName } = getIsolatedDatabaseCase(caseId)
  return `^${fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`
}

export function getIsolatedDatabaseCaseMode(
  caseId: IsolatedDatabaseCaseId,
  env: ChildEnvironment = process.env,
): 'parent' | 'child' {
  getIsolatedDatabaseCase(caseId)
  const childCaseId = env.VITEST_ISOLATED_DATABASE_CASE
  const databaseName = env.VITEST_ISOLATED_DATABASE_CHILD
  if (!childCaseId && !databaseName) return 'parent'
  if (childCaseId !== caseId || !databaseName || !databaseNamePattern.test(databaseName)) {
    throw new Error(`Invalid isolated database child identity for ${caseId}`)
  }
  const databaseUrl = env.DATABASE_URL
  const readDatabaseUrl = env.READ_DATABASE_URL
  if (!databaseUrl || !readDatabaseUrl) {
    throw new Error(`Isolated database child ${caseId} needs both database URLs`)
  }
  const parsed = new URL(databaseUrl)
  const readParsed = new URL(readDatabaseUrl)
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
    parsed.pathname !== `/${databaseName}` ||
    parsed.searchParams.has('dbname') ||
    parsed.searchParams.has('host') ||
    parsed.searchParams.has('hostaddr') ||
    readParsed.toString() !== parsed.toString()
  ) {
    throw new Error(`Isolated database child ${caseId} requires its exact disposable database`)
  }
  return 'child'
}

export function getIsolatedDatabaseChildCase(env: ChildEnvironment = process.env) {
  const caseId = env.VITEST_ISOLATED_DATABASE_CASE
  if (!caseId) throw new Error('Missing isolated database child case')
  const registeredCase = getIsolatedDatabaseCase(caseId)
  getIsolatedDatabaseCaseMode(caseId as IsolatedDatabaseCaseId, env)
  if (!env.VITEST_ISOLATED_DATABASE_CHILD) {
    throw new Error(`Isolated database child ${caseId} is missing its database marker`)
  }
  return registeredCase
}
