import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  scheduledJobManifest as aiAgentsManifest,
  upsertSchedules as registerAiAgents,
} from '@queues/ai-agents/enqueues/schedules'
import { ai_agents } from '@queues/ai-agents/queues'
import {
  scheduledJobManifest as bedrockManifest,
  upsertSchedules as registerBedrock,
} from '@queues/bedrock-embeddings-batch/enqueues/schedules'
import { bedrock_embeddings_batch } from '@queues/bedrock-embeddings-batch/queues'
import {
  scheduledJobManifest as bloomManifest,
  upsertSchedules as registerBloom,
} from '@queues/bloom-filters/enqueues/schedules'
import { bloomFilters } from '@queues/bloom-filters/queues'
import {
  scheduledJobManifest as boilerplateManifest,
  upsertSchedules as registerBoilerplate,
} from '@queues/crawl-boilerplate-removal/enqueues/schedules'
import { boilerplateRemovalQueue } from '@queues/crawl-boilerplate-removal/queues'
import {
  scheduledJobManifest as crawlHostnamesManifest,
  upsertSchedules as registerCrawlHostnames,
} from '@queues/crawl-hostnames/enqueues/schedules'
import { crawlHostnamesQueue } from '@queues/crawl-hostnames/queues'
import {
  scheduledJobManifest as crawlReferralManifest,
  upsertSchedules as registerCrawlReferral,
} from '@queues/crawl-referral-links/enqueues/schedules'
import { crawlReferralLinksQueue } from '@queues/crawl-referral-links/queues'
import {
  scheduledJobManifest as findYourFriendsManifest,
  upsertSchedules as registerFindYourFriends,
} from '@queues/find-your-friends/enqueues/schedules'
import { findYourFriendsQueue } from '@queues/find-your-friends/queues'
import {
  scheduledJobManifest as imagesManifest,
  upsertSchedules as registerImages,
} from '@queues/images/enqueues/schedules'
import { imagesQueue } from '@queues/images/queues'
import {
  scheduledJobManifest as openAiModerationManifest,
  upsertSchedules as registerOpenAiModeration,
} from '@queues/openai-moderation/enqueues/schedules'
import { openai_moderation_omni_single } from '@queues/openai-moderation/queues'
import {
  scheduledJobManifest as kagiManifest,
  upsertSchedules as registerKagi,
} from '@queues/kagi-smallweb/enqueues/schedules'
import { kagiSmallWeb } from '@queues/kagi-smallweb/queues'
import {
  scheduledJobManifest as sitemapsManifest,
  upsertSchedules as registerSitemaps,
} from '@queues/sitemaps/enqueues/schedules'
import { sitemaps } from '@queues/sitemaps/queues'
import {
  scheduledJobManifest as unfurlManifest,
  upsertSchedules as registerUnfurl,
} from '@queues/unfurl-referral-links/enqueues/schedules'
import { unfurlReferralLinksQueue } from '@queues/unfurl-referral-links/queues'
import {
  scheduledJobManifest as blacklistManifest,
  upsertSchedules as registerBlacklist,
} from '@queues/urls-domains-blacklist/enqueues/schedules'
import { urlsDomainsBlacklist } from '@queues/urls-domains-blacklist/queues'
import {
  scheduledJobManifest as voteWeightManifest,
  upsertSchedules as registerVoteWeight,
} from '@queues/vote-weight/enqueues/schedules'
import { voteWeightQueue } from '@queues/vote-weight/queues'
import {
  scheduledJobManifest as wikipediaManifest,
  upsertSchedules as registerWikipedia,
} from '@queues/wikipedia-recommender/enqueues/schedules'
import { wikipediaRecommender } from '@queues/wikipedia-recommender/queues'

const REGISTRATIONS = [
  [registerAiAgents, ai_agents, aiAgentsManifest],
  [registerBedrock, bedrock_embeddings_batch, bedrockManifest],
  [registerBloom, bloomFilters, bloomManifest],
  [registerBoilerplate, boilerplateRemovalQueue, boilerplateManifest],
  [registerCrawlHostnames, crawlHostnamesQueue, crawlHostnamesManifest],
  [registerCrawlReferral, crawlReferralLinksQueue, crawlReferralManifest],
  [registerFindYourFriends, findYourFriendsQueue, findYourFriendsManifest],
  [registerImages, imagesQueue, imagesManifest],
  [registerOpenAiModeration, openai_moderation_omni_single, openAiModerationManifest],
  [registerKagi, kagiSmallWeb, kagiManifest],
  [registerSitemaps, sitemaps, sitemapsManifest],
  [registerUnfurl, unfurlReferralLinksQueue, unfurlManifest],
  [registerBlacklist, urlsDomainsBlacklist, blacklistManifest],
  [registerVoteWeight, voteWeightQueue, voteWeightManifest],
  [registerWikipedia, wikipediaRecommender, wikipediaManifest],
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
