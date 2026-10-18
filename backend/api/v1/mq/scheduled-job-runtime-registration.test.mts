import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  scheduledJobManifest as aiAgentsManifest,
  upsertSchedules as registerAiAgents,
} from '@queues/ai-agents/enqueues/schedules'
import { ai_agents } from '@queues/ai-agents/queues'
import {
  scheduledJobManifest as bloomManifest,
  upsertSchedules as registerBloom,
} from '@queues/bloom-filters/enqueues/schedules'
import { bloomFilters } from '@queues/bloom-filters/queues'
import {
  scheduledJobManifest as findYourFriendsManifest,
  upsertSchedules as registerFindYourFriends,
} from '@queues/find-your-friends/enqueues/schedules'
import { findYourFriendsQueue } from '@queues/find-your-friends/queues'
import {
  combineBackgroundManifests,
  upsertBackgroundSchedules,
} from '@queues/background/enqueues/schedules'
import { background } from '@queues/background/queues'
import { scheduledJobManifest as openAiModerationManifest } from '@queues/openai-moderation/enqueues/schedules'
import { scheduledJobManifest as postPublicationManifest } from '@queues/post-publication/enqueues/schedules'
import { scheduledJobManifest as sesInboundManifest } from '@queues/ses-inbound/enqueues/schedules'
import { scheduledJobManifest as storyProjectionManifest } from '@queues/story-post-related-url-projections/enqueues/schedules'
import { scheduledJobManifest as kagiManifest } from '@queues/kagi-smallweb/enqueues/schedules'
import { scheduledJobManifest as rssFeedsManifest } from '@queues/rss-feeds/enqueues/schedules'
import { scheduledJobManifest as sitemapsManifest } from '@queues/sitemaps/enqueues/schedules'
import { scheduledJobManifest as blacklistManifest } from '@queues/urls-domains-blacklist/enqueues/schedules'
import { scheduledJobManifest as voteWeightManifest } from '@queues/vote-aggregation/enqueues/schedules'

const BACKGROUND_MANIFESTS = [
  sesInboundManifest,
  openAiModerationManifest,
  storyProjectionManifest,
  postPublicationManifest,
  voteWeightManifest,
  rssFeedsManifest,
  sitemapsManifest,
  kagiManifest,
  blacklistManifest,
]
const registerBackground = () => upsertBackgroundSchedules(BACKGROUND_MANIFESTS)
const REGISTRATIONS = [
  [registerAiAgents, ai_agents, aiAgentsManifest],
  [registerBloom, bloomFilters, bloomManifest],
  [registerFindYourFriends, findYourFriendsQueue, findYourFriendsManifest],
  [registerBackground, background, combineBackgroundManifests(BACKGROUND_MANIFESTS)],
] as const

describe('scheduled job runtime registration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('upserts every job in each queue manifest', async () => {
    await Promise.all(
      REGISTRATIONS.map(async ([register, queue, manifest]) => {
        const upsert = vi.spyOn(queue, 'upsertJobScheduler').mockResolvedValue(undefined)

        await register()

        expect(upsert).toHaveBeenCalledTimes(manifest.jobs.length)
      }),
    )
  })
})
