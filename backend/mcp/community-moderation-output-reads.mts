import type { ToolOutputSchema } from '@services/openai-agents/tool-types'
import {
  array,
  ban,
  boolean,
  changeComponent,
  component,
  map,
  nullOr,
  number,
  object,
  pageInfo,
  reference,
  restriction,
  text,
  type Schema,
} from './community-moderation-output-parts.mts'

const indexed = (kind: string, field: string, entity: Schema, users = false) =>
  object({
    results: array(reference(kind)),
    page_info: pageInfo(),
    [field]: map(entity),
    ...(users ? { users: component('Record_string_PublicUser') } : {}),
  })

const pendingReport = () => {
  const schema = changeComponent(
    'Omit_PendingModerationReport__cursor_created_at_____cursor_report_count_____cursor_severity_rank_',
    {
      escalated_at: nullOr(text),
      escalated_by_id: nullOr(text),
      claim: nullOr(component('ModerationQueueClaim')),
      community_ban_evasion: {
        anyOf: [
          component('CommunityBanEvasionContext'),
          object({ community_id: text, community_slug: text }),
          { type: 'null' },
        ],
      },
    },
    [
      'is_system_generated',
      'target_is_restricted',
      'target_is_anonymous',
      'post_moderation_context',
      'case_id',
    ],
  )
  return {
    ...schema,
    required: (schema['required'] as string[]).filter(
      key =>
        !['reporter_user_id', 'reporter_username', 'note', 'community_ban_evasion'].includes(key),
    ),
  }
}

const pendingPost = () => {
  const basicUser = component('BasicUser')
  const createdBy = {
    ...basicUser,
    properties: {
      ...(basicUser['properties'] as Record<string, Schema>),
      display_account: nullOr(component('PublicDisplayAccount')),
    },
  }
  return changeComponent('Post', {
    claim: nullOr(component('ModerationQueueClaim')),
    escalated_at: nullOr(text),
    is_flagged_by_openai_omni_moderation: nullOr(boolean),
    created_by: nullOr(createdBy),
    updated_by: nullOr(createdBy),
  })
}

const automodActions = () =>
  object({
    automod_actions: array(component('RecentAutomodAction')),
    stats: object({
      total_count: number,
      false_positive_count: number,
      false_positive_rate: number,
    }),
    page_info: object({ has_next_page: boolean, end_cursor: nullOr(text) }),
  })

const moderatorAction = () =>
  object({
    id: text,
    community_id: nullOr(text),
    moderation_transparency_community_id: nullOr(text),
    actor_user_id: nullOr(text),
    action_type: text,
    post_id: nullOr(text),
    target_user_id: nullOr(text),
    report_id: nullOr(text),
    review_dispute_id: nullOr(text),
    community_application_id: nullOr(text),
    moderation_appeal_id: nullOr(text),
    topic_claim_id: nullOr(text),
    report_integrity_flag_id: nullOr(text),
    report_abuse_penalty_id: nullOr(text),
    vote_integrity_flag_id: nullOr(text),
    vote_weight_penalty_id: nullOr(text),
    agent_moderation_id: nullOr(text),
    oauth_client_id: nullOr(text),
    user_moderator_note_id: nullOr(text),
    hostname_crawler_configuration_id: nullOr(text),
    topic_id: nullOr(text),
    operation_request_action_id: nullOr(text),
    queue_name: nullOr(text),
    scheduled_job_key: nullOr(text),
    backfill_key: nullOr(text),
    rss_category_text: nullOr(text),
    admin_import_batch_id: nullOr(text),
    reason: nullOr(text),
    metadata: component('Record_string_unknown'),
    created_at: text,
  })

export function communityModerationReadOutput(option: string): ToolOutputSchema | null {
  switch (option) {
    case 'list_applications':
      return indexed(
        'community_application',
        'community_applications',
        changeComponent('CommunityApplication', {}, ['__entity_type']),
      )
    case 'list_automod_actions':
      return automodActions()
    case 'list_bans':
      return indexed('community_ban', 'community_bans', ban(), true)
    case 'list_invites':
      return indexed(
        'community_invite',
        'community_invites',
        changeComponent('CommunityInvite', {}, ['__entity_type', 'code']),
      )
    case 'read_moderation_analytics':
      return component('ModerationAnalytics')
    case 'read_moderator_stats':
      return object({
        window: { enum: [30, 90] },
        stats: array(component('ModeratorActionCounts')),
        users: component('Record_string_PublicUser'),
        page_info: pageInfo(),
      })
    case 'read_moderator_vacation':
      return component('CommunityMemberVacationSettings')
    case 'read_modlog':
      return indexed('moderator_action', 'moderator_actions', moderatorAction(), true)
    case 'list_pending_posts':
      return object(
        {
          results: array(reference('post')),
          page_info: pageInfo(),
          posts: map(pendingPost()),
          posts_metrics: map(component('PostMetrics')),
          post_link_embeds: map(component('ResolvedEmbed')),
        },
        ['results', 'page_info', 'posts', 'posts_metrics', 'post_link_embeds'],
      )
    case 'list_pending_reports':
      return object({
        reports: array(pendingReport()),
        page_info: object({
          has_next_page: boolean,
          has_previous_page: boolean,
          end_cursor: nullOr(text),
          start_cursor: nullOr(text),
        }),
      })
    case 'list_restrictions': {
      return object({
        results: array(reference('community_restriction')),
        page_info: pageInfo(),
        community_restrictions: map(restriction()),
        raid_mode_suggestion: component('RaidModeSuggestion'),
      })
    }
    case 'list_saved_replies':
      return object({ results: array(component('CommunitySavedReply')), page_info: pageInfo() })
    default:
      return null
  }
}
