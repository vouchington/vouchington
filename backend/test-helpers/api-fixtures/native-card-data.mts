import { topic } from './data.mts'

const individualId = '00000000-0000-7000-8000-000000000700'
export const authorizedId = '00000000-0000-7000-8000-000000000701'
export const secondId = '00000000-0000-7000-8000-000000000702'
export const primaryId = '00000000-0000-7000-8000-000000000703'
const primaryTopicId = '00000000-0000-7000-8000-000000000711'
export const authorizedTopicId = '00000000-0000-7000-8000-000000000712'
export const secondTopicId = '00000000-0000-7000-8000-000000000713'
export const cardCursorScope = `my-cards:${individualId}:id-asc`
export const cardMigratedFrom = [
  'docs/requirements/users/USER_SETTINGS.md',
  'web/components/my/cards-manager.tsx',
]

const primaryTopicSummary = {
  id: primaryTopicId,
  name: 'Sapphire Reserve',
  slug: 'sapphire-reserve',
}
export const primaryCard = {
  id: primaryId,
  card_id: primaryTopicId,
  opened_on: '2021-04-15',
  closed_on: null,
  credit_limit: { amount: 2_500_000, currency: 'usd' },
  received_sign_up_bonus_on: '2021-07-01',
  is_authorized_user: false,
  authorized_user_of_id: null,
  note: 'Primary travel card',
  card: primaryTopicSummary,
  authorized_user_of_card: null,
}
export const authorizedCard = {
  id: authorizedId,
  card_id: authorizedTopicId,
  opened_on: '2024-01-20',
  closed_on: null,
  credit_limit: { amount: 0, currency: 'usd' },
  received_sign_up_bonus_on: null,
  is_authorized_user: true,
  authorized_user_of_id: primaryId,
  note: 'Authorized-user account',
  card: {
    id: authorizedTopicId,
    name: 'Freedom Unlimited',
    slug: 'freedom-unlimited',
  },
  authorized_user_of_card: {
    id: primaryId,
    opened_on: primaryCard.opened_on,
    closed_on: primaryCard.closed_on,
    card: primaryTopicSummary,
  },
}
export const secondCard = {
  id: secondId,
  card_id: secondTopicId,
  opened_on: null,
  closed_on: '2025-12-31',
  credit_limit: null,
  received_sign_up_bonus_on: null,
  is_authorized_user: false,
  authorized_user_of_id: null,
  note: null,
  card: {
    id: secondTopicId,
    name: 'Everyday Cash',
    slug: 'everyday-cash',
  },
  authorized_user_of_card: null,
}
export const cardTopic = {
  ...topic,
  id: authorizedTopicId,
  name: authorizedCard.card.name,
  slug: authorizedCard.card.slug,
  topic_type: 'card',
}
