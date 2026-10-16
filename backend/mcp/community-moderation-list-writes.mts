import { addCommunityListItem, removeCommunityListItem } from '@services/communities'
import { isAdminUser } from '@services/users'
import {
  communityModerationNoContent,
  type CommunityModerationHandler,
} from './community-moderation-contract.mts'
import { communityWithGuard } from './community-moderation-guards.mts'

const itemTypes = {
  domain: ['url_hostname', 'url_hostname_id'],
  post: ['post', 'post_id'],
  rss_feed: ['rss_feed', 'rss_feed_id'],
  topic: ['topic', 'topic_id'],
  url: ['url', 'url_id'],
} as const

async function addItem(
  user: Parameters<CommunityModerationHandler>[0],
  args: Parameters<CommunityModerationHandler>[1],
  kind: keyof typeof itemTypes,
) {
  const { community } = await communityWithGuard(user, args.community, 'list')
  const [type, key] = itemTypes[kind]
  const item = await addCommunityListItem(
    user.id,
    community.id,
    type,
    args[key] as string,
    kind === 'domain' ? { isAdministrator: isAdminUser(user) } : undefined,
  )
  return { community_list_item: item }
}

async function removeItem(
  user: Parameters<CommunityModerationHandler>[0],
  args: Parameters<CommunityModerationHandler>[1],
  kind: keyof typeof itemTypes,
) {
  const { community } = await communityWithGuard(user, args.community, 'list')
  await removeCommunityListItem(user.id, community.id, args.itemId as string, itemTypes[kind][0])
  return communityModerationNoContent()
}

export const communityModerationListWrites: Record<string, CommunityModerationHandler> = {
  add_domain_to_list: (user, args) => addItem(user, args, 'domain'),
  add_post_to_list: (user, args) => addItem(user, args, 'post'),
  add_rss_feed_to_list: (user, args) => addItem(user, args, 'rss_feed'),
  add_topic_to_list: (user, args) => addItem(user, args, 'topic'),
  add_url_to_list: (user, args) => addItem(user, args, 'url'),
  remove_domain_from_list: (user, args) => removeItem(user, args, 'domain'),
  remove_post_from_list: (user, args) => removeItem(user, args, 'post'),
  remove_rss_feed_from_list: (user, args) => removeItem(user, args, 'rss_feed'),
  remove_topic_from_list: (user, args) => removeItem(user, args, 'topic'),
  remove_url_from_list: (user, args) => removeItem(user, args, 'url'),
}
