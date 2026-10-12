import { createMergedTool } from '../create-merged-tool.mts'
import read_my_lists_containing from '../get-my-lists-containing.mts'
import read_my_lists_items from '../get-list-items.mts'
import read_my_lists_get from '../get-list.mts'
import read_my_lists_list from '../get-my-lists.mts'
import read_my_profile_bio from '../get-my-bio.mts'
import read_my_profile_links from '../get-my-profile-links.mts'
import read_my_profile_overview from '../get-my-profile.mts'
import read_my_preferences_email from '../get-my-email-preferences.mts'
import read_my_preferences_general from '../get-my-preferences.mts'
import read_my_notifications_list from '../get-my-notifications.mts'
import read_my_notifications_unread from '../get-my-unread-notifications.mts'
import remove_list_content_list from '../delete-list.mts'
import remove_list_content_item from '../remove-list-item.mts'
import remove_referral_link_activation from '../deactivate-referral-link.mts'
import remove_referral_link_link from '../delete-referral-link.mts'
import mark_notifications_read_all from '../mark-all-notifications-read.mts'
import mark_notifications_read_one from '../mark-notification-read.mts'
import manage_bookmark_remove from '../remove-bookmark.mts'
import manage_bookmark_set from '../set-bookmark.mts'
import edit_my_profile_bio from '../update-my-bio.mts'
import edit_my_profile_display_identity from '../update-my-display-identity.mts'
import edit_my_profile_link from '../update-my-profile-link.mts'
import edit_my_preferences_email from '../update-my-email-preferences.mts'
import edit_my_preferences_general from '../update-my-preferences.mts'
export const userMergedAccountGroups = [
  {
    name: 'read_my_lists',
    options: [
      { option: 'containing', source: read_my_lists_containing },
      { option: 'items', source: read_my_lists_items },
      { option: 'get', source: read_my_lists_get },
      { option: 'list', source: read_my_lists_list },
    ],
  },
  {
    name: 'read_my_profile',
    options: [
      { option: 'bio', source: read_my_profile_bio },
      { option: 'links', source: read_my_profile_links },
      { option: 'overview', source: read_my_profile_overview },
    ],
  },
  {
    name: 'read_my_preferences',
    options: [
      { option: 'email', source: read_my_preferences_email },
      { option: 'general', source: read_my_preferences_general },
    ],
  },
  {
    name: 'read_my_notifications',
    options: [
      { option: 'list', source: read_my_notifications_list },
      { option: 'unread', source: read_my_notifications_unread },
    ],
  },
  {
    name: 'remove_list_content',
    options: [
      { option: 'list', source: remove_list_content_list },
      { option: 'item', source: remove_list_content_item },
    ],
  },
  {
    name: 'remove_referral_link',
    options: [
      { option: 'activation', source: remove_referral_link_activation },
      { option: 'link', source: remove_referral_link_link },
    ],
  },
  {
    name: 'mark_notifications_read',
    options: [
      { option: 'all', source: mark_notifications_read_all },
      { option: 'one', source: mark_notifications_read_one },
    ],
  },
  {
    name: 'manage_bookmark',
    options: [
      { option: 'remove', source: manage_bookmark_remove },
      { option: 'set', source: manage_bookmark_set },
    ],
  },
  {
    name: 'edit_my_profile',
    options: [
      { option: 'bio', source: edit_my_profile_bio },
      { option: 'display_identity', source: edit_my_profile_display_identity },
      { option: 'link', source: edit_my_profile_link },
    ],
  },
  {
    name: 'edit_my_preferences',
    options: [
      { option: 'email', source: edit_my_preferences_email },
      { option: 'general', source: edit_my_preferences_general },
    ],
  },
] as const
export const userMergedAccountTools = userMergedAccountGroups.map(group =>
  createMergedTool(
    group.name,
    group.name
      .split('_')
      .map(word => word[0]!.toUpperCase() + word.slice(1))
      .join(' '),
    group.options,
  ),
)
