import assert from 'http-assert'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import { createPaginationParser } from '@modules/pagination'
import { getPaginationLimitsForContract } from '@services/pagination'
import { indexById } from '@modules/utils'
import { loadCommunityForPublicationModerator, searchPendingPosts } from '@services/communities'
import {
  attachPostClaims,
  listCommunityPendingModerationReports,
} from '@services/moderation-claims'
import { labelAndMaskPosts } from '@services/content-provenance'
import { getPostByAnyCachedBatch, getPostMetricsByAnyCachedBatch } from '@services/entity-fetch'
import type { Post } from '@services/posts'
import { getUrlEmbedsByUrlIds } from '@services/rss-feed-items/get-url-embed'
import { isAdminUser, isModerationStaff } from '@services/users'
import { buildReportPageInfo } from '@services/moderation-reports'
import { parseReportCursor } from '@services/moderation-reports/cursor'
import {
  communityModeratorVisibleReportSort,
  parseCommunityReportSort,
  redactCommunityBanEvasionContext,
} from '@services/moderation-reports/community-helpers'
import type { CommunityModerationHandler } from './community-moderation-contract.mts'
import { staffOrModeratorCommunity } from './community-moderation-guards.mts'

const reportParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 50 },
})

async function sanitizePendingPostText(value: string, contentType: string): Promise<string> {
  return wrapExternalContent(await sanitizePromptInjection(value), {
    source: 'post',
    contentType,
  })
}

async function sanitizePendingStructuredData(value: unknown): Promise<unknown> {
  if (typeof value === 'string') return sanitizePendingPostText(value, 'structured_data')
  if (Array.isArray(value)) return Promise.all(value.map(sanitizePendingStructuredData))
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    await Promise.all(
      Object.entries(value).map(async ([key, child]) => [
        key,
        await sanitizePendingStructuredData(child),
      ]),
    ),
  )
}

async function sanitizePendingPost(
  post: Post | null | undefined,
): Promise<Post | null | undefined> {
  if (!post) return post
  const safe = { ...post }
  if ('structured_data' in post)
    safe.structured_data = await sanitizePendingStructuredData(post.structured_data)
  if (post.images)
    safe.images = await Promise.all(
      post.images.map(async image => ({
        ...image,
        caption: await sanitizePendingPostText(image.caption, 'image_caption'),
      })),
    )
  return safe
}

export const communityModerationReadQueues: Record<string, CommunityModerationHandler> = {
  async list_pending_posts(user, args) {
    const { community } = await loadCommunityForPublicationModerator(user, args.community)
    const result = await searchPendingPosts(community.id, {
      limit: args.limit as number | undefined,
      after: args.after as string | undefined,
    })
    const ids = result.results.map(post => post.id as string)
    const claims = await attachPostClaims(result.results as Array<{ id: string }>)
    const claimByPostId = new Map(claims.map(row => [row.id, row.claim]))
    const escalatedByPostId = new Map(
      result.results.map(row => [
        row.id as string,
        ((row as Record<string, unknown>).escalated_at as string | null) ?? null,
      ]),
    )
    const posts = await Promise.all(
      (await labelAndMaskPosts(await getPostByAnyCachedBatch(ids), null)).map(sanitizePendingPost),
    )
    const byId = indexById(posts)
    for (const [id, post] of Object.entries(byId)) {
      ;(post as Record<string, unknown>).claim = claimByPostId.get(id) ?? null
      ;(post as Record<string, unknown>).escalated_at = escalatedByPostId.get(id) ?? null
    }
    const urlIds = [
      ...new Set(
        posts.flatMap(post => (post?.post_type === 'link' && post.url_id ? [post.url_id] : [])),
      ),
    ]
    const embeds = urlIds.length
      ? await getUrlEmbedsByUrlIds(urlIds, {}, isAdminUser(user) ? 'administrator' : 'public')
      : {}
    const linkEmbeds = Object.fromEntries(
      posts.flatMap(post =>
        post?.post_type === 'link' && post.url_id && embeds[post.url_id]
          ? [[post.id, embeds[post.url_id]]]
          : [],
      ),
    )
    return {
      results: ids.map(id => ({ __entity_type: 'post' as const, id })),
      page_info: result.page_info,
      posts: byId,
      posts_metrics: indexById(await getPostMetricsByAnyCachedBatch(ids)),
      post_link_embeds: linkEmbeds,
    }
  },
  async list_pending_reports(user, args) {
    const { community } = await staffOrModeratorCommunity(user, args.community)
    const staff = isModerationStaff(user)
    const requestedSort = parseCommunityReportSort(args.sort)
    const sort = staff ? requestedSort : communityModeratorVisibleReportSort(requestedSort)
    const scope = `community-pending-reports:${community.id}:${staff ? 'staff' : 'member'}`
    const { limit, after } = reportParser.parse(
      args,
      getPaginationLimitsForContract(reportParser.queryContract),
    )
    const cursor = after ? parseReportCursor(after) : null
    assert(
      !cursor ||
        (!cursor.cluster &&
          cursor.scope === scope &&
          cursor.sort === sort &&
          cursor.status === 'pending'),
      422,
      'Invalid cursor',
    )
    const flatCursor = cursor && !cursor.cluster ? cursor : null
    const { reports, hasNextPage } = await listCommunityPendingModerationReports({
      communityId: community.id,
      limit,
      sort,
      afterCursor: flatCursor
        ? {
            id: flatCursor.id,
            reportCount: flatCursor.reportCount,
            severityRank: flatCursor.severityRank,
          }
        : null,
    })
    return {
      reports: reports.map(
        ({
          cursor_created_at: _a,
          cursor_report_count: _b,
          cursor_severity_rank: _c,
          reporter_user_id,
          reporter_username,
          note,
          judgement,
          community_ban_evasion,
          is_system_generated: _d,
          target_is_restricted: _e,
          target_is_anonymous,
          post_moderation_context: _f,
          case_id: _caseId,
          ...report
        }) => ({
          ...report,
          ...(staff
            ? { reporter_user_id, reporter_username, note, judgement, community_ban_evasion }
            : {
                judgement: null,
                community_ban_evasion: community_ban_evasion
                  ? redactCommunityBanEvasionContext(community_ban_evasion)
                  : community_ban_evasion,
              }),
          target_user_id: staff || !target_is_anonymous ? report.target_user_id : null,
        }),
      ),
      page_info: buildReportPageInfo(reports, hasNextPage, Boolean(cursor), {
        sort,
        status: 'pending',
        scope,
      }),
    }
  },
}
