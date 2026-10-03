import type { PublicUser, User } from './types'

export const storyCurrentUser: User = {
  account_type: null,
  id: 'user-story-current',
  username: 'cardholder',
  roles: ['user'],
  markdown: 'I compare cards, referral programs, and travel tools.',
  membership_plan: 'pro',
}
export const publicUsers: PublicUser[] = [
  {
    account_type: null,
    id: 'user-alex',
    username: 'alex',
    profile_image_id: null,
    display_account: { name: 'Alex Morgan' },
  },
  {
    id: 'user-agent',
    username: 'voucha-agent',
    profile_image_id: null,
    account_type: 'ai_agent',
  },
  { account_type: null, id: 'user-empty', username: 'newmember', profile_image_id: null },
]
