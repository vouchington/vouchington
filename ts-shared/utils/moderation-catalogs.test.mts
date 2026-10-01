import { describe, expect, it } from 'vitest'
import {
  INTEGRITY_FLAG_STATUSES,
  INTEGRITY_FLAG_STATUS_FILTERS,
  MODERATION_APPEAL_ACTIONS,
  MODERATION_APPEAL_STATUSES,
  MODERATION_REPORT_RESOLUTION_STATUSES,
  MODERATION_REPORT_STATUSES,
  MODERATOR_ACTION_TYPES,
  REPORT_INTEGRITY_FLAG_TYPES,
  REPORT_INTEGRITY_PATCH_RESOLUTIONS,
  REPORT_INTEGRITY_RESOLUTIONS,
  REVIEW_DISPUTE_ACTIONS,
  REVIEW_DISPUTE_REASONS,
  REVIEW_DISPUTE_RESOLUTION_ACTIONS,
  REVIEW_DISPUTE_STATUSES,
  VOTE_INTEGRITY_FLAG_TYPES,
  VOTE_INTEGRITY_RESOLUTIONS,
} from './moderation-catalogs.mts'

describe('moderation catalogs', () => {
  it('exports appeal lifecycle catalogs', () => {
    expect(MODERATION_APPEAL_STATUSES).toEqual(['pending', 'resolved', 'dismissed'])
    expect(MODERATION_APPEAL_ACTIONS).toEqual(['accept', 'deny', 'reduce'])
  })

  it('exports review dispute lifecycle catalogs', () => {
    expect(REVIEW_DISPUTE_REASONS).toEqual([
      'factually_inaccurate',
      'defamatory',
      'impersonation',
      'privacy_violation',
      'other',
    ])
    expect(REVIEW_DISPUTE_STATUSES).toEqual(['pending', 'resolved', 'dismissed'])
    expect(REVIEW_DISPUTE_ACTIONS).toEqual(['no_action', 'remove', 'annotate', 'dismiss'])
    expect(REVIEW_DISPUTE_RESOLUTION_ACTIONS).toEqual(['remove', 'annotate', 'dismiss'])
  })

  it('exports report and integrity catalogs', () => {
    expect(MODERATION_REPORT_STATUSES).toEqual(['pending', 'reviewed', 'actioned', 'dismissed'])
    expect(MODERATION_REPORT_RESOLUTION_STATUSES).toEqual(['reviewed', 'dismissed'])
    expect(REPORT_INTEGRITY_FLAG_TYPES).toEqual(['mass_report_suspected'])
    expect(REPORT_INTEGRITY_RESOLUTIONS).toEqual(['dismissed', 'penalized'])
    expect(REPORT_INTEGRITY_PATCH_RESOLUTIONS).toEqual(['dismissed'])
    expect(VOTE_INTEGRITY_FLAG_TYPES).toEqual(['velocity_spike', 'ip_correlation'])
    expect(VOTE_INTEGRITY_RESOLUTIONS).toEqual(['dismissed', 'penalized', 'suspended'])
    expect(INTEGRITY_FLAG_STATUSES).toEqual(['pending', 'resolved'])
    expect(INTEGRITY_FLAG_STATUS_FILTERS).toEqual(['pending', 'resolved', 'all'])
  })

  it('exports moderator action types', () => {
    // Independent expected contracts are grouped by the surfaces that emit audit actions.
    const contentAndMembershipActions = [
      'remove',
      'approve',
      'reject',
      'ban',
      'lift_ban',
      'activate_restriction',
      'lift_restriction',
      'warn',
      'lock',
      'unlock',
      'pin',
      'unpin',
      'tag',
      'suspend',
      'unsuspend',
      'remove_member',
      'change_role',
    ]
    const reportAndAppealResolutionActions = [
      'resolve_report',
      'dismiss_report',
      'resolve_appeal',
      'dismiss_appeal',
    ]
    const topicClaimActions = ['topic_claim_verify', 'topic_claim_reject', 'topic_claim_revoke']
    const reportAssignmentActions = [
      'report_claim',
      'report_unclaim',
      'report_escalate',
      'report_deescalate',
    ]
    const integrityAndVoteActions = [
      'report_integrity_flag_review',
      'report_integrity_penalty_apply',
      'report_integrity_penalty_revoke',
      'vote_integrity_flag_review',
      'vote_integrity_penalty_apply',
      'vote_integrity_penalty_revoke',
      'vote_weight_set',
      'vote_weight_reset',
      'agent_moderation_vote_set',
      'agent_moderation_vote_delete',
    ]
    const moderationReviewActions = [
      'mod_note_delete',
      'report_judgement_rerun',
      'appeal_resolution_draft_rerun',
      'dispute_resolution_draft_rerun',
    ]
    const oauthClientAndCrawlerActions = [
      'oauth_client_verify',
      'oauth_client_unverify',
      'crawler_create',
      'crawler_update',
      'crawler_delete',
    ]
    const rssCategoryActions = [
      'rss_category_assign',
      'rss_category_reject',
      'rss_category_unreject',
    ]
    const queueAndMaintenanceActions = [
      'queue_pause',
      'queue_resume',
      'queue_retry_failed',
      'scheduled_job_run',
      'backfill_run',
      'article_sync_run',
      'import_batch_create',
    ]
    const legalProcessActions = ['preservation_hold_place', 'preservation_hold_release']

    expect(MODERATOR_ACTION_TYPES).toEqual([
      ...contentAndMembershipActions,
      ...reportAndAppealResolutionActions,
      ...topicClaimActions,
      ...reportAssignmentActions,
      ...integrityAndVoteActions,
      ...moderationReviewActions,
      ...oauthClientAndCrawlerActions,
      ...rssCategoryActions,
      ...queueAndMaintenanceActions,
      ...legalProcessActions,
    ])
  })
})
