import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  projectScheduledJobs,
  upsertScheduledJobManifest,
  type ScheduledJobQueue,
} from '@modules/scheduled-job-manifest'
import type { DeployEnvironmentSource } from '@ts-shared/deploy-environment'
import { SCHEDULED_JOB_MANIFESTS } from './scheduled-job-manifests.mts'

const NON_PRODUCTION_CLAMP_JOBS = [
  'account-data-requests/accountDataRequestRecovery',
  'activitypub-inbox/activitypub-inbox-recovery',
  'ai_agents/reconcileAutoDispatchJudgements',
  'ai_agents/reconcileBackgroundResponses',
  'ai_agents/reconcileChatRuntimeGenerations',
  'ai_agents/reconcileMemberSupportAgentIntents',
  'bedrock-embeddings-batch/backlog_dispatcher',
  'bedrock-embeddings-batch/creation_dispatcher',
  'bedrock-embeddings-batch/poll_dispatcher',
  'emails/dispatchCommunityModerationSummaryEmails',
  'memberships/appleNotificationRecovery',
  'memberships/googlePlayNotificationRecovery',
  'memberships/googlePlayAcknowledgementRecovery',
  'memberships/dispatchMembershipRefundReconciliation',
  'memberships/membershipEntitlementEffects',
  'memberships/membershipGrantExpiry',
  'memberships/membershipVerificationRecovery',
  'memberships/stripeCatalogReconciliation',
  'memberships/stripeEventRecovery',
  'notifications/notification-push-intent-recovery',
  'oauth-authorization-exchange/oauthAuthorizationExchangeDispatcher',
  'openai_moderation_omni_single/reconcile-image-quarantines',
  'openai_moderation_omni_single/reconcile-post-moderation',
  'rss-feeds/dispatchRssFeeds',
  'ses_inbound/ses-inbound-reconciliation',
  'user-deletions/userDeletionRecovery',
].sort() as `${string}/${string}`[]

describe('staging hourly-floor clamp', () => {
  afterEach(() => vi.restoreAllMocks())

  // ECS sets NODE_ENV to production in every deployed environment, including staging. The explicit
  // deployment-environment source exercises the real staging clamp without mutating process.env.
  it('clamps exactly the non-production high-frequency jobs and leaves every other repeat unchanged', async () => {
    const baseline = await captureRegisteredRepeats({ ENVIRONMENT: 'production' })
    const staging = await captureRegisteredRepeats({ ENVIRONMENT: 'staging' })
    expect(baseline.size).toBe(74)
    expect(staging.size).toBe(74)
    const clamped = [...baseline.keys()].filter(
      key => JSON.stringify(staging.get(key)) !== JSON.stringify(baseline.get(key)),
    )
    expect(clamped.sort()).toEqual(NON_PRODUCTION_CLAMP_JOBS)
    for (const key of clamped) expect(isExactlyAtHourlyFloor(staging.get(key))).toBe(true)
  })

  it('leaves the production-only daily cleanup schedule unchanged in staging', async () => {
    const staging = await captureRegisteredRepeats({ ENVIRONMENT: 'staging' })
    expect(staging.get('psql/data-retention-cleanup-daily')).toEqual({ pattern: '0 4 * * *' })
  })

  it('uses the production baseline when no deployment environment is supplied', async () => {
    const repeats = new Map<string, unknown>()
    for (const manifest of SCHEDULED_JOB_MANIFESTS) {
      const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
      upsertJobScheduler.mockResolvedValue(undefined)
      await upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest)
      for (const [schedulerId, repeat] of upsertJobScheduler.mock.calls.map(
        call => [call[0], call[1]] as const,
      ))
        repeats.set(`${manifest.queueName}/${schedulerId}`, repeat)
    }
    const production = await captureRegisteredRepeats({ ENVIRONMENT: 'production' })
    for (const [key, repeat] of repeats) expect(repeat).toEqual(production.get(key))
  })

  it('keeps projected operator schedules aligned with the clamped runtime repeats', () => {
    const surfaceIdByJobKey = new Map(
      SCHEDULED_JOB_MANIFESTS.flatMap(manifest =>
        manifest.jobs.flatMap(job => {
          const surface = job.operatorSurfaces.find(
            candidate => candidate.kind === 'scheduled-jobs',
          )
          return surface ? [[`${manifest.queueName}/${job.schedulerId}`, surface.id] as const] : []
        }),
      ),
    )
    const expectedClampedIds = NON_PRODUCTION_CLAMP_JOBS.flatMap(key => {
      const id = surfaceIdByJobKey.get(key)
      return id === undefined ? [] : [id]
    }).sort()
    const baseline = projectScheduledJobs(SCHEDULED_JOB_MANIFESTS)
    const staging = projectScheduledJobs(SCHEDULED_JOB_MANIFESTS, undefined, {
      applyHourlyFloor: true,
    })
    const baselineById = new Map(baseline.map(job => [job.id, job.schedule]))
    const actualClampedIds = staging
      .filter(job => job.schedule !== baselineById.get(job.id))
      .map(job => job.id)
      .sort()
    expect(actualClampedIds).toEqual(expectedClampedIds)
    expect(
      staging.filter(job => actualClampedIds.includes(job.id)).map(job => job.schedule),
    ).toEqual(actualClampedIds.map(() => 'every 1h'))
  })
})

async function captureRegisteredRepeats(
  env: DeployEnvironmentSource,
): Promise<Map<string, unknown>> {
  const repeats = new Map<string, unknown>()
  for (const manifest of SCHEDULED_JOB_MANIFESTS) {
    const upsertJobScheduler = vi.fn<ScheduledJobQueue['upsertJobScheduler']>()
    upsertJobScheduler.mockResolvedValue(undefined)
    await upsertScheduledJobManifest(makeQueue(upsertJobScheduler), manifest, {
      nodeEnv: 'production',
      env,
    })
    for (const [schedulerId, repeat] of upsertJobScheduler.mock.calls.map(
      call => [call[0], call[1]] as const,
    ))
      repeats.set(`${manifest.queueName}/${schedulerId}`, repeat)
  }
  return repeats
}

function makeQueue(upsertJobScheduler: ScheduledJobQueue['upsertJobScheduler']): ScheduledJobQueue {
  return {
    upsertJobScheduler,
    getRepeatableJobs: async () => [],
    removeJobScheduler: async () => undefined,
  }
}

function isExactlyAtHourlyFloor(repeat: unknown): boolean {
  if (typeof repeat !== 'object' || repeat === null) return false
  if ('every' in repeat) return repeat.every === 3_600_000
  if ('pattern' in repeat) return repeat.pattern === '0 * * * *'
  return false
}
