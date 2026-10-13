import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { reportCoverage } from '../explain-coverage.mts'

describe('EXPLAIN extractor overlap', () => {
  it('keeps raw session-local PoolClient reads visible as uncovered', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'explain-coverage-pool-client-'))
    try {
      const resultsPath = join(fixtureDir, 'results.json')
      writeFileSync(
        resultsPath,
        JSON.stringify({
          results: [{ name: 'other', query_text: '/* other */ SELECT 1', scenario_id: 'fixture' }],
          completedScenarioIds: ['fixture'],
        }),
      )
      const fileName = 'backend/services/notifications/reconcile-batches.mts'
      const source = readFileSync(join(import.meta.dirname, '../..', fileName), 'utf8')
      const report = await reportCoverage([{ fileName, source }], resultsPath, ['fixture'])
      expect(report).toMatchObject({ annotatedStatements: 6, reads: 3, coveredReads: 0 })
      expect(report.uncoveredReads.map(read => read.name)).toEqual([
        'selectRssFeedItemNotificationRecipientBatch',
        'selectPostNotificationRecipientBatch',
        'selectCreatedNotificationBatch',
      ])
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
  })

  it('lists assembled reads only when their extracted SQL has a known read verb', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'explain-coverage-assembled-'))
    try {
      const resultsPath = join(fixtureDir, 'results.json')
      writeFileSync(
        resultsPath,
        JSON.stringify({
          results: [{ name: 'other', query_text: '/* other */ SELECT 1', scenario_id: 'fixture' }],
          completedScenarioIds: ['fixture'],
        }),
      )
      const paths = [
        'backend/services/comments/ancestors.mts',
        'backend/services/comments/descendant-ids.mts',
        'backend/services/bookmarks/counts.mts',
        'backend/services/bookmarks/query.mts',
        'backend/services/communities/get.mts',
        'backend/services/communities/load-with-viewer.mts',
        'backend/services/data-points/insights.mts',
        'backend/services/elections-votes/entity-relation/refresh-stats.mts',
        'backend/services/elections-votes/entity-relation/resolve-election-target.mts',
        'backend/services/feeds/rss-feed-items/story-member-pages.mts',
        'backend/services/images/placements.mts',
        'backend/services/moderation-appeals/get.mts',
        'backend/services/notifications/reconcile-batches.mts',
        'backend/services/post-publication/shadow-audit.mts',
        'backend/services/posts/metrics-batch.mts',
        'backend/services/posts/metrics.mts',
        'backend/services/remote-actors/list-followers-of-user.mts',
        'backend/services/rss-feeds/get-to-fetch.mts',
        'backend/services/topics/metrics-batch.mts',
        'backend/services/users/is-active.mts',
        'backend/services/users/is-federation-enabled.mts',
        'backend/services/trending-communities/get-trending-communities.mts',
        'backend/services/users/follow-context-queries.mts',
        'backend/services/users/metrics-batch.mts',
        'backend/services/vote-weight/gather-factors.mts',
        'backend/services/vote-integrity/get-penalties.mts',
      ]
      const sources = paths.map(fileName => ({
        fileName,
        source: readFileSync(join(import.meta.dirname, '../..', fileName), 'utf8'),
      }))
      const report = await reportCoverage(sources, resultsPath, ['fixture'])
      expect(report.uncoveredReads.map(read => read.name)).toEqual(
        expect.arrayContaining([
          'buildCommentAncestorsQuery',
          'getVisibleCommentDescendantIdsPage',
          'getUserBookmarkCounts',
          'getEntityBookmarkCounts',
          'queryEntityBookmarksForRelations',
          'getCommunityBySlugOnly',
          'getCommunityById',
          'getCommunityBySlug',
          'getCommunityWithViewerById',
          'getCommunityWithViewerBySlug',
          'getTopicDataPointInsights',
          'refreshEntityRelationVoteStatsById',
          'resolveEntityRelationElectionTargetById',
          'getStoryMemberPagesBatch',
          'getImagePlacementsForCopyright',
          'getModerationAppealById',
          'listPostPublicationShadowAuditCandidates',
          'getPostMetricsByAnyBatch',
          'getPostMetricsByAny',
          'getRssFeedByIdToFetch',
          'isUserActive',
          'isFederationEnabledForUser',
          'listRemoteFollowerInboxPage',
          'getTopicMetricsByAnyBatch',
          'getTrendingCommunities',
          'getUserMetricsByAnyBatch',
          'gatherVoteWeightFactors',
          'getFollowedUsersByElectionVote',
          'getVoteWeightPenalties',
          'selectPostNotificationRecipientBatch',
          'selectRssFeedItemNotificationRecipientBatch',
        ]),
      )
      expect(report.reads).toBeGreaterThanOrEqual(9)
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
  })

  it('counts overlapping extraction passes once while retaining subpath cursor and notification reads', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'explain-coverage-extractors-'))
    try {
      const resultsPath = join(fixtureDir, 'results.json')
      writeFileSync(
        resultsPath,
        JSON.stringify({
          results: [
            {
              name: 'selectRssFeedItemNotificationRecipientBatch',
              query_text: '/* selectRssFeedItemNotificationRecipientBatch */ SELECT user_id',
              scenario_id: 'fixture',
            },
            {
              name: 'selectPostNotificationRecipientBatch',
              query_text: '/* selectPostNotificationRecipientBatch */ SELECT user_id',
              scenario_id: 'fixture',
            },
          ],
          completedScenarioIds: ['fixture'],
        }),
      )
      const paths = [
        'backend/services/notifications/reconcile-batches.mts',
        'backend/services/referral-program-link-validations/contains-referral-links.mts',
      ]
      const sources = paths.map(fileName => ({
        fileName,
        source: readFileSync(join(import.meta.dirname, '../..', fileName), 'utf8'),
      }))
      const report = await reportCoverage(sources, resultsPath, ['fixture'])
      expect(report).toMatchObject({ annotatedStatements: 7, reads: 4, coveredReads: 0 })
      expect(report.ambiguousReads.map(read => read.name)).toEqual([
        'selectRssFeedItemNotificationRecipientBatch',
        'selectPostNotificationRecipientBatch',
      ])
      expect(report.uncoveredReads.map(read => read.name)).toEqual([
        'selectCreatedNotificationBatch',
        'containsReferralLinks',
      ])
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
  })

  it('inventories aliased executors and imported SQL builders at their runtime callsites', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'explain-coverage-read-owners-'))
    try {
      const resultsPath = join(fixtureDir, 'results.json')
      writeFileSync(
        resultsPath,
        JSON.stringify({
          results: [{ name: 'other', query_text: '/* other */ SELECT 1', scenario_id: 'fixture' }],
          completedScenarioIds: ['fixture'],
        }),
      )
      const paths = [
        'backend/services/bluesky-accounts/link-authorization.mts',
        'backend/services/my/landing-pages/reads.mts',
        'backend/services/topics/metrics-batch.mts',
        'backend/services/users/metrics-batch.mts',
        'backend/services/posts/moderation-input.mts',
        'backend/services/lists/lists.mts',
        'backend/services/post-classifier/configuration.mts',
        'backend/services/openai-moderation/posts.mts',
        'backend/services/my/landing-pages/shared.mts',
        'backend/services/classifier-runs/run-read.mts',
        'backend/services/images/placement-owner.mts',
        'backend/services/memberships/google/acknowledgement.mts',
        'backend/services/media-delivery-safety/delivery-registry-staging.mts',
        'backend/services/copyright-notices/placement-resolution.mts',
      ]
      const sources = paths.map(fileName => ({
        fileName,
        source: readFileSync(join(import.meta.dirname, '../..', fileName), 'utf8'),
      }))
      const report = await reportCoverage(sources, resultsPath, ['fixture'])
      expect(report.uncoveredReads.map(read => read.name)).toEqual(
        expect.arrayContaining([
          'readBlueskyLinkAuthorization',
          'getLandingPageRowForUser',
          'getTopicMetricsByAnyBatch',
          'getUserMetricsByAnyBatch',
          'getPostModerationInput:images',
          'fetchListById',
          'canonicalizePostClassifierConfiguration',
          'isPostOpenAIModerationUpToDate',
          'findExistingPostOpenAIModeration',
          'getUsernameForLandingPages',
          'readClassifierRunOutcomes',
          'getImagePlacementCopyrightOwner',
          'ensureGooglePlayAcknowledgement.identity',
          'stageImagePlacementDeliveryRecord:current',
          'resolveCopyrightImagePlacement',
        ]),
      )
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
  })

  it('leaves a dynamic topic branch ambiguous after a same-named scenario captures one shape', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'explain-coverage-topic-branch-'))
    try {
      const resultsPath = join(fixtureDir, 'results.json')
      writeFileSync(
        resultsPath,
        JSON.stringify({
          results: [
            {
              name: 'getTopicByAny',
              query_text: '/* getTopicByAny */ WITH candidates AS (SELECT id FROM topics)',
              scenario_id: 'fixture',
            },
          ],
          completedScenarioIds: ['fixture'],
        }),
      )
      const fileName = 'backend/services/topics/get.mts'
      const source = readFileSync(join(import.meta.dirname, '../..', fileName), 'utf8')
      const report = await reportCoverage([{ fileName, source }], resultsPath, ['fixture'])
      expect(report.ambiguousReads.map(read => read.name)).toContain('getTopicByAny')
      expect(report.coveredReads).toBe(0)
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
  })

  it('matches only the bounded cursor wrapper around the exact complete source SQL', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'explain-coverage-bounded-cursor-'))
    try {
      const resultsPath = join(fixtureDir, 'results.json')
      const source = `import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import sql from 'sql-template-strings'
createAsyncGeneratorFromCursor(sql\`/* boundedCursorRead */ SELECT id FROM posts;\`, { maxRows: 10 })
`
      const sources = [{ fileName: 'backend/services/posts/bounded.mts', source }]
      const capture = (inner: string) => {
        writeFileSync(
          resultsPath,
          JSON.stringify({
            results: [
              {
                name: 'boundedCursorRead',
                query_text: `/* boundedCursorRead */ SELECT * FROM (${inner}) bounded_cursor_rows LIMIT $1`,
                scenario_id: 'bounded',
              },
            ],
            completedScenarioIds: ['bounded'],
          }),
        )
      }
      capture('/* boundedCursorRead */ SELECT id FROM posts')
      expect(await reportCoverage(sources, resultsPath, ['bounded'])).toMatchObject({
        annotatedStatements: 1,
        reads: 1,
        coveredReads: 1,
        uncoveredReads: [],
      })
      capture('/* boundedCursorRead */ SELECT id FROM other_posts')
      expect(await reportCoverage(sources, resultsPath, ['bounded'])).toMatchObject({
        annotatedStatements: 1,
        reads: 1,
        coveredReads: 0,
        uncoveredReads: [expect.objectContaining({ name: 'boundedCursorRead' })],
      })
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
  })
})
