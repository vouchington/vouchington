import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import {
  getCommunityOrThrow,
  getCommunityMember,
  currentUserCanModerateCommunity,
} from '@services/communities'
import { isModerationStaff } from '@services/users'
import {
  searchCommunityModerationQueue,
  encodeCommunityModerationQueueCursor,
} from '@services/communities/publications/moderation-queue'

/**
 * GET /api/v1/communities/:idOrSlug/moderation-queue
 *
 * Returns the community moderation queue. Requires authentication and community membership.
 * Site staff receive reporter-only context; community moderators and members receive
 * redacted views without reporter identity, reporter notes, or note-derived judgements.
 */
app.route('/api/v1/communities/:idOrSlug/moderation-queue').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/communities/:idOrSlug/moderation-queue')
  const { idOrSlug } = ctx.params as { idOrSlug: string }

  // Resolve community first so membership lookup uses the UUID (not slug)
  const community = await getCommunityOrThrow(idOrSlug)
  const membership = await getCommunityMember(community.id, currentUser.id)

  // Site staff can access any community queue; regular users must be members
  const isStaff = isModerationStaff(currentUser)
  ctx.assert(isStaff || membership !== null, 403, 'Forbidden')

  validateRequestContract(ctx, 'GET:/api/v1/communities/:idOrSlug/moderation-queue', {
    path: ctx.params,
  })

  // Site staff and community mods/owners can moderate; only site staff get reporter-only fields.
  const viewerTier: 'moderator' | 'member' =
    isStaff || currentUserCanModerateCommunity(currentUser, community, membership)
      ? 'moderator'
      : 'member'

  const limitRaw = ctx.query.limit !== undefined ? Number(ctx.query.limit) : 25
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 25

  const after = typeof ctx.query.after === 'string' ? ctx.query.after : undefined

  const { entries, hasNextPage } = await searchCommunityModerationQueue(community.id, {
    limit,
    after,
    // Pre-publication reviews leak unpublished post titles; restrict to moderator tier.
    includePendingReviews: viewerTier === 'moderator',
    viewerTier,
  })

  const responseEntries =
    viewerTier === 'member'
      ? entries.map(
          ({
            reporter_user_id: _r,
            reporter_username: _u,
            note: _n,
            resolved_by_id: _rid,
            cursor_created_at: _c,
            cursor_report_count: _crc,
            cursor_severity_rank: _csr,
            admin_action_path: _a,
            target_is_restricted,
            target_is_anonymous: _ta,
            target_label,
            target_content,
            target_path,
            judgement: _j,
            post_moderation_context,
            ...entry
          }) => {
            // Hidden = private/followers-only OR soft-deleted: also drop the moderation
            // context. The AI judgement is staff-only because it can derive from reporter notes.
            const hidden = target_is_restricted || entry.target_available === false
            return {
              ...entry,
              target_label: target_is_restricted ? '[Private content]' : target_label,
              target_content: hidden ? null : target_content,
              target_path: target_is_restricted ? null : target_path,
              // Members never need to identify the target user (no Warn action for members).
              target_user_id: null,
              judgement: null,
              post_moderation_context: hidden ? null : post_moderation_context,
            }
          },
        )
      : entries.map(
          ({ cursor_created_at: _, target_is_restricted: _t, target_is_anonymous, ...entry }) => {
            const { cursor_report_count: _crc, cursor_severity_rank: _csr, ...publicEntry } = entry
            // Community moderators/owners review reports without reporter identity or reporter
            // notes (matching /communities/:idOrSlug/reports/pending). Only site staff see
            // reporter-only context.
            // Null out target_user_id for anonymous posts when viewer is not site staff,
            // to prevent deanonymizing authors before they are approved.
            const anonymityRedacted = !isStaff && target_is_anonymous
            if (!isStaff) {
              const {
                reporter_user_id: _rid,
                reporter_username: _run,
                note: _note,
                judgement: _judgement,
                target_user_id,
                ...rest
              } = publicEntry
              return {
                ...rest,
                target_user_id: anonymityRedacted ? null : target_user_id,
                judgement: null,
              }
            }
            return publicEntry
          },
        )

  ctx.json({
    entries: responseEntries,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor:
        hasNextPage && entries.length > 0
          ? encodeCommunityModerationQueueCursor(entries[entries.length - 1]!)
          : null,
      start_cursor: null,
    },
    viewer_tier: viewerTier,
  })
})
