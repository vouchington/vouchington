import type { PublicUser, User } from './types'

export const storyCurrentUser: User = {
  id: 'user-story-current',
  username: 'cardholder',
  roles: ['user'],
  markdown: 'I compare cards, referral programs, and travel tools.',
  membership_plan: 'pro',
}
export const publicUsers: PublicUser[] = [
  {
    id: 'user-alex',
    username: 'alex',
    profile_image_id: null,
    display_account: { name: 'Alex Morgan' },
  },
  {
    id: 'user-agent',
    username: 'voucha-agent',
    profile_image_id: null,
    is_official_account: true,
  },
  { id: 'user-empty', username: 'newmember', profile_image_id: null },
]
