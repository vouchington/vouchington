import assert from 'http-assert'
import { isUUID } from '@modules/utils'
import {
  activateCommunityRestrictions,
  banUserFromCommunity,
  liftCommunityBan,
  liftCommunityRestriction,
  loadCommunityWithViewer,
  getCommunityOrThrow,
  COMMUNITY_RESTRICTION_TYPES,
  removeMember,
  revokeInvite,
  type CommunityRestrictionType,
} from '@services/communities'
import { dismissBanEvasionFlag } from '@services/communities/ban-evasion'
import { clearMyCommunityVacation } from '@services/community-member-vacations'
import { createSavedReply, deleteSavedReply } from '@services/modmail'
import {
  getModerationReportTargetUserId,
  isModerationReportInCommunityScope,
} from '@services/moderation-reports'
import { resolveModerationReport } from '@services/moderation-reports/resolve'
import { createUserWarning, parseCreateUserWarningInput } from '@services/user-warnings'
import {
  communityModerationNoContent,
  type CommunityModerationHandler,
} from './community-moderation-contract.mts'
import { communityWithGuard, staffOrModeratorCommunity } from './community-moderation-guards.mts'

export const communityModerationOtherWrites: Record<string, CommunityModerationHandler> = {
  async ban_user(user, args) {
    const { community } = await communityWithGuard(user, args.community, 'bans')
    assert(!community.archived_at, 403, 'Community is archived')
    assert(
      typeof args.user_id === 'string' && isUUID(args.user_id),
      422,
      'user_id must be a valid UUID',
    )
    const expiresAt = args.expires_at ? new Date(args.expires_at as string) : undefined
    assert(
      !expiresAt || (!isNaN(expiresAt.getTime()) && expiresAt > new Date()),
      422,
      'expires_at must be in the future',
    )
    const ban = await banUserFromCommunity(user, community.id, args.user_id, {
      reason: (args.reason as string | null | undefined) ?? undefined,
      expiresAt,
    })
    const { case_id: _, ...community_ban } = ban
    return { community_ban }
  },
  async lift_ban(user, args) {
    const { community } = await communityWithGuard(user, args.community, 'bans')
    await liftCommunityBan(user, community.id, args.userId as string)
    return communityModerationNoContent()
  },
  async dismiss_ban_evasion(user, args) {
    const community = await getCommunityOrThrow(args.community)
    assert(!community.archived_at, 403, 'Community is archived')
    await dismissBanEvasionFlag(user, community.id, args.userId as string)
    return communityModerationNoContent()
  },
  async revoke_invite(user, args) {
    // REST delegates all authorization to the invite service; idOrSlug is only a path contract.
    await revokeInvite(user.id, args.id as string)
    return communityModerationNoContent()
  },
  async remove_member(user, args) {
    const community = await getCommunityOrThrow(args.community)
    await removeMember(user.id, community, args.userId as string)
    return communityModerationNoContent()
  },
  async activate_restrictions(user, args) {
    const loaded = await loadCommunityWithViewer(args.community, user.id)
    assert(
      Array.isArray(args.restriction_types) &&
        args.restriction_types.every(
          type =>
            typeof type === 'string' &&
            COMMUNITY_RESTRICTION_TYPES.includes(type as CommunityRestrictionType),
        ),
      422,
      'Invalid restriction_type',
    )
    const expiresAt = args.expires_at ? new Date(args.expires_at as string) : null
    assert(!expiresAt || !isNaN(expiresAt.getTime()), 422, 'expires_at is not a valid date')
    const restrictions = await activateCommunityRestrictions(user, loaded, {
      restrictionTypes: args.restriction_types as CommunityRestrictionType[],
      expiresAt,
      reason: (args.reason as string | null | undefined) ?? null,
    })
    return { community_restrictions: Object.fromEntries(restrictions.map(row => [row.id, row])) }
  },
  async lift_restriction(user, args) {
    const loaded = await loadCommunityWithViewer(args.community, user.id)
    await liftCommunityRestriction(user, loaded, args.id as string)
    return communityModerationNoContent()
  },
  async create_saved_reply(user, args) {
    const { community } = await communityWithGuard(user, args.community, 'saved_replies')
    const reply = await createSavedReply(user.id, community.id, {
      title: (args.title as string | undefined) ?? '',
      body: args.body as string,
    })
    return { reply }
  },
  async delete_saved_reply(user, args) {
    const { community } = await communityWithGuard(user, args.community, 'saved_replies')
    await deleteSavedReply(user.id, community.id, args.id as string)
    return communityModerationNoContent()
  },
  async clear_moderator_vacation(user, args) {
    const { community } = await communityWithGuard(user, args.community, 'vacation')
    await clearMyCommunityVacation(user.id, { communityId: community.id })
    return communityModerationNoContent()
  },
  async issue_warning(user, args) {
    const { community } = await staffOrModeratorCommunity(user, args.community)
    const input = parseCreateUserWarningInput({
      userId: args.userId,
      reason: args.reason,
      publicMessage: args.publicMessage,
      communityId: community.id,
      reportId: args.reportId,
      resolveReport: args.resolveReport,
    })
    if (input.reportId) {
      const targetId = await getModerationReportTargetUserId(input.reportId)
      assert(targetId !== null, 404, 'Report not found')
      assert(
        await isModerationReportInCommunityScope(input.reportId, community.id),
        403,
        'Report is not within this community',
      )
      input.userId = targetId
    }
    const warning = await createUserWarning(user.id, input, { returnExistingForReport: true })
    if (input.reportId && input.resolveReport)
      await resolveModerationReport(input.reportId, {
        trainingEvidence: 'agent',
        communityId: community.id,
        status: 'actioned',
        resolvedById: user.id,
      })
    const { user_id: _uid, case_id: _cid, ...safeWarning } = warning
    return { warning: safeWarning }
  },
}
