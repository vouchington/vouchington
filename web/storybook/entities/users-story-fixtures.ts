import { publicUsers, storyCurrentUser } from './entity-fixtures'
import type { ProfileLink, User } from '@/types/user'

export const profileUser: User = {
  ...storyCurrentUser,
  id: publicUsers[0]!.id,
  username: publicUsers[0]!.username,
  display_account: publicUsers[0]!.display_account,
  markdown: 'I write public reviews and curate landing page links for the products I use.',
}

export const profileLinkGithub = {
  id: 'profile-link-github',
  user_id: profileUser.id,
  link_type: 'github',
  sort_order: 0,
  url: null,
  handle: 'octocat',
  name: null,
  image_id: null,
  created_at: '2026-05-10T12:00:00.000Z',
  updated_at: '2026-05-10T12:00:00.000Z',
} satisfies ProfileLink

export const profileLinkSite = {
  id: 'profile-link-site',
  user_id: profileUser.id,
  link_type: 'url',
  sort_order: 1,
  url: 'https://example.com',
  handle: null,
  name: 'Example',
  image_id: null,
  created_at: '2026-05-10T12:00:00.000Z',
  updated_at: '2026-05-10T12:00:00.000Z',
} satisfies ProfileLink
