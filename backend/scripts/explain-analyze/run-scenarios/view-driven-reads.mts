import { read } from '@data-stores/psql'
import { getActiveCommunityAgentPrompts } from '@services/community-agent-prompts/get-active-prompts'
import { captureAutotaggerAgentCandidateTopicIds } from '@services/autotagger/agent/candidates'
import { getRecoverableOAuthAuthorizationIds } from '@services/oauth/authorization-exchange-recovery'
import { buildIdentityVerificationPaidMembershipGate } from '@services/identity-verification/attempt-grants'
import { searchListItems } from '@services/lists/items'
import {
  importCommunityListFeedItemsSourceSql,
  importCommunityListPostsSourceSql,
} from '@services/lists/import'
import { getModerationSummaryRecipients } from '@services/communities/moderation-summary-emails'
import { detectRssFeedItemLanguage } from '@services/language-detection/entities/rss-feed-items'
import { detectRssFeedItemLanguageBatch } from '@services/language-detection/batch-detect'
import { runAndCapture, seedPostId, seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import { registerScenarioContract } from '../plan-expectations.mts'

export async function runViewDrivenReadScenarios(): Promise<void> {
  const { rows: rssItems } = await read<{ id: string }>(
    `/* viewDrivenRssFixture */ SELECT id FROM rss_feed_items
     WHERE data ->> 'title' = 'Seed Item 0' LIMIT 1`,
  )
  const rssItemId = rssItems[0]?.id
  if (!rssItemId) throw new Error('Missing view-driven RSS language fixture')
  const linguaResult = {
    detector: 'lingua',
    detectorModelVersion: '1.0.0',
    languages: [{ iso6391: 'en', iso6393: 'eng', confidence: 0.95 }],
  }
  registerScenarioContract('detect-rss-feed-item-language-batch', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'rss_feed_item_sources', max: 100 },
      { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 100 },
    ],
  })
  await runAndCapture(
    'detect-rss-feed-item-language-batch',
    () =>
      detectRssFeedItemLanguageBatch([rssItemId], {
        detectLanguageMany: async () => [linguaResult],
      }),
    undefined,
    'detectRssFeedItemLanguageBatch',
  )
  registerScenarioContract('detect-rss-feed-item-language', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'rss_feed_item_sources', max: 100 },
      { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 100 },
    ],
  })
  await runAndCapture(
    'detect-rss-feed-item-language',
    () => detectRssFeedItemLanguage(rssItemId, { detectLanguage: async () => linguaResult }),
    undefined,
    'detectRssFeedItemLanguage',
  )

  registerScenarioContract('moderation-summary-recipients', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'community_members', max: 120 },
      { kind: 'maxProcessedRows', relation: 'users', max: 120 },
    ],
  })
  await runAndCapture('moderation-summary-recipients', () =>
    getModerationSummaryRecipients(new Date()).then(recipients => {
      if (!recipients.some(({ id }) => id === seedUuid(1, '01'))) {
        throw new Error('Seeded moderator was not eligible for a moderation summary')
      }
      return recipients
    }),
  )

  const listId = seedUuid(0, '34')
  registerScenarioContract('search-list-items', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'user_list_posts', max: 96 },
      { kind: 'maxProcessedRows', relation: 'posts', max: 96 },
    ],
    seededRows: { user_list_posts: 1080 },
  })
  await runAndCapture('search-list-items', () =>
    searchListItems(listId, { limit: 25, read: false, currentUserId: seedUser.id }),
  )

  registerScenarioContract('import-community-list', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'community_list_posts', max: 50 },
      { kind: 'maxProcessedRows', relation: 'community_list_rss_feeds', max: 20 },
      { kind: 'maxProcessedRows', relation: 'posts', max: 100 },
      { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: 1000 },
    ],
    seededRows: { community_list_posts: 35, community_list_rss_feeds: 2 },
  })
  await runAndCapture('import-community-list', async () => {
    const params = [seedUuid(2, '34'), seedUuid(0, '14')]
    await read(
      importCommunityListPostsSourceSql(seedUuid(2, '34'), seedUuid(0, '14'), {
        kind: 'user',
        userId: seedUser.id,
        staffRole: null,
      }),
    )
    await read(importCommunityListFeedItemsSourceSql, [...params, 20])
  })

  registerScenarioContract('active-community-agent-prompts', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'memberships', max: 50 }],
    seededRows: { community_agent_prompts: 4, agent_prompts: 4 },
  })
  await runAndCapture('active-community-agent-prompts', () =>
    getActiveCommunityAgentPrompts(seedUuid(0, '14')),
  )

  registerScenarioContract('identity-verification-attempt-membership-gate', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'memberships', max: 25 }],
    seededRows: { memberships: 300 },
  })
  await runAndCapture('identity-verification-attempt-membership-gate', async () => {
    const { rows } = await read(buildIdentityVerificationPaidMembershipGate(seedUser.id))
    if (rows.length !== 1) throw new Error('Seeded paid membership gate did not match')
  })

  registerScenarioContract('autotagger-agent-candidate-topics', {
    expectations: [
      { kind: 'queryBinds', token: 'membership_id' },
      { kind: 'maxProcessedRows', relation: 'memberships', max: 3000 },
    ],
  })
  await runAndCapture('autotagger-agent-candidate-topics', () =>
    captureAutotaggerAgentCandidateTopicIds(read, { postId: seedPostId, rssFeedItemId: null }),
  )

  registerScenarioContract('recoverable-oauth-authorizations', {
    expectations: [{ kind: 'maxProcessedRows', relation: 'oauth_authorizations', max: 1000 }],
  })
  await runAndCapture(
    'recoverable-oauth-authorizations',
    () => getRecoverableOAuthAuthorizationIds(25),
    undefined,
    ['getRecoverableOAuthAuthorizationIds:lock', 'getRecoverableOAuthAuthorizationIds'],
  )
}
