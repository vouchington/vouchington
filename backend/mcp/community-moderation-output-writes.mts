import type { ToolOutputSchema } from '@services/openai-agents/tool-types'
import {
  array,
  ban,
  boolean,
  changeComponent,
  component,
  map,
  nullOr,
  object,
  restriction,
  text,
  type Schema,
} from './community-moderation-output-parts.mts'

const noContent = new Set([
  'lock_post',
  'unlock_post',
  'confirm_ban_evasion',
  'dismiss_automod_flag',
  'escalate_post',
  'escalate_report',
  'review_application',
  'moderate_post',
  'dismiss_ban_evasion',
  'lift_ban',
  'revoke_invite',
  'remove_domain_from_list',
  'remove_post_from_list',
  'remove_rss_feed_from_list',
  'remove_topic_from_list',
  'remove_url_from_list',
  'remove_member',
  'clear_moderator_vacation',
  'release_post_claim',
  'deescalate_post',
  'release_report_claim',
  'deescalate_report',
  'lift_restriction',
  'delete_saved_reply',
])
export const communityModerationIsNoContent = (option: string) => noContent.has(option)

const report = () => {
  const schema = component('ModerationReport')
  const properties = schema['properties'] as Record<string, Schema>
  return {
    ...schema,
    properties: { ...properties },
    required: (schema['required'] as string[]).filter(
      key => key !== 'reporter_user_id' && key !== 'note' && key !== 'case_id',
    ),
  }
}

const warning = () => changeComponent('UserWarning', {}, ['user_id', 'case_id'])

export function communityModerationWriteOutput(option: string): ToolOutputSchema | null {
  if (noContent.has(option)) return object({ success: { const: true } })
  switch (option) {
    case 'create_mod_note':
      return object({ note: component('UserModNote') })
    case 'delete_mod_note':
      return object({ ok: { const: true } })
    case 'ban_user':
      return object({ community_ban: ban() })
    case 'add_domain_to_list':
    case 'add_post_to_list':
    case 'add_rss_feed_to_list':
    case 'add_topic_to_list':
    case 'add_url_to_list':
      return object({ community_list_item: component('CommunityListItem') })
    case 'open_post_mod_internal_thread':
    case 'open_report_mod_internal_thread':
      return object({ conversation: component('ModInternalThread') })
    case 'activate_restrictions':
      return object({ community_restrictions: map(restriction()) })
    case 'create_saved_reply':
      return object({ reply: component('CommunitySavedReply') })
    case 'issue_warning':
      return object({ warning: warning() })
    case 'update_community_settings':
    case 'update_post_type_settings':
      return object({ community: changeComponent('Community', {}, ['__entity_type']) })
    case 'set_vacation_digest_preference':
      return object({ should_suppress_community_digests_while_on_vacation: boolean })
    case 'update_modmail_thread':
      return object({ thread: component('ModmailThread') })
    case 'resolve_report':
      return object({ report: report() })
    case 'set_application_questions':
      return object({
        questions: array(changeComponent('CommunityApplicationQuestion', {}, ['__entity_type'])),
      })
    case 'set_moderator_vacation':
      return component('CommunityMemberVacationSettings')
    case 'set_pinned_posts':
      return object({
        pinned_posts: array(
          object({
            community_id: text,
            post_id: text,
            order_index: { type: 'number' },
            pinned_by_id: text,
            created_at: text,
          }),
        ),
      })
    case 'claim_post':
    case 'claim_report':
      return object({
        claim: nullOr(component('ModerationQueueClaim')),
        claimed_by_other: boolean,
      })
    default:
      return null
  }
}
