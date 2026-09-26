import type { FinancialProfile } from '@/types/my'
import type { Post, PostCommunity } from '@/types/posts'
import type { User } from '@/types/user'
import { communities } from '@/storybook/entities/fixtures/communities'
import { posts, postsResponse } from '@/storybook/entities/fixtures/posts'
import { topics } from '@/storybook/entities/fixtures/topics'
import { publicUsers, storyCurrentUser } from '@/storybook/entities/fixtures/users'

function requirePost(postType: Post['post_type']): Post {
  const post = posts.find(item => item.post_type === postType)
  if (!post) throw new Error(`Fixture posts are missing a ${postType} post`)
  return post
}

const foundReviewPost = posts.find(post => post.post_type === 'review')
if (!foundReviewPost) throw new Error('Fixture posts are missing a review post')

export const reviewPost = foundReviewPost
export const discussionPost = requirePost('discussion')
export const dataPointPost = requirePost('data_point')
export const commentPost = requirePost('comment')

function requireTopic(index: number) {
  const topic = topics[index]
  if (!topic) throw new Error(`Fixture topics are missing index ${index}`)
  return topic
}

export const openBankingTopic = requireTopic(0)
export const cardTopic = requireTopic(1)
export const bankTopic = requireTopic(2)
export const rewardsTopic = requireTopic(3)

const creditCards = communities[0]
const travel = communities[1]
if (!creditCards || !travel) throw new Error('Fixture communities are incomplete')

export const creditCardCommunity: PostCommunity = {
  id: creditCards.id,
  name: creditCards.name,
  slug: creditCards.slug,
}

export const communityOptions = [
  {
    id: creditCards.id,
    name: creditCards.name,
    slug: creditCards.slug,
    visibility: 'public' as const,
    post_approval_required_at: null,
  },
  {
    id: travel.id,
    name: travel.name,
    slug: travel.slug,
    visibility: 'private' as const,
    post_approval_required_at: null,
  },
]

const alex = publicUsers[0]
const official = publicUsers[1]
if (!alex || !official) throw new Error('Fixture users are incomplete')

export const alexUser = alex
export const officialUser = official

export const administrator: User = {
  ...storyCurrentUser,
  roles: ['administrator'],
}

export const postAuthor: User = {
  ...storyCurrentUser,
  id: alex.id,
  username: alex.username,
  roles: ['administrator'],
}

export const reviewMarkdown = [
  'The Sapphire Reserve paid for itself in the first year through lounge access and the travel credit.',
  'Dining at 3x and the transfer partners covered two award flights to Tokyo.',
  'I would keep the card for another year if the annual fee stays at this level.',
].join(' ')

export const reviewWithBody: Post = { ...reviewPost, markdown: reviewMarkdown }

export const incomeRange = {
  minimum: { amount: 8_000_000, currency: 'usd' as const },
  maximum: { amount: 12_000_000, currency: 'usd' as const },
}

export const financialProfile: FinancialProfile = {
  user_id: alex.id,
  currency: 'usd',
  credit_score_range: '670-739',
  stated_income_range: incomeRange,
  total_credit_limit: { amount: 4_500_000, currency: 'usd' },
  years_of_credit_history: 8,
  hard_inquiries_12m: 2,
  cards_opened_24m: 1,
  updated_at: reviewPost.updated_at,
}

export const badgeLabels = {
  private: 'Private',
  locked: 'Locked',
  followers: 'Followers',
  signedIn: 'Signed In',
  mutual: 'Mutual',
}

export const discussionCategories = [{ id: openBankingTopic.id, name: openBankingTopic.name }]

export function electionFor(post: Post) {
  const election = postsResponse.post_elections?.[post.id]
  if (!election) throw new Error(`Fixture posts are missing an election for ${post.id}`)
  return election
}

export function metricsFor(post: Post) {
  const metrics = postsResponse.posts_metrics[post.id]
  if (!metrics) throw new Error(`Fixture posts are missing metrics for ${post.id}`)
  return metrics
}

export function htmlFor(post: Post): string {
  return postsResponse.markdown_to_html?.[post.id] ?? `<p>${post.markdown}</p>`
}

export const creditCardData: Record<string, unknown> = {
  currency: 'usd',
  topic_ids: [cardTopic.id],
  topic_name: cardTopic.name,
  result: 'approved',
  existing_relationship: true,
  credit_limit: { amount: 1_200_000, currency: 'usd' },
  is_business_application: false,
  application_method: 'online',
  application_date: '2026-03-18',
  credit_score_range: '670-739',
  stated_income_range: incomeRange,
  hard_inquiries_12m: 2,
  cards_opened_24m: 1,
  total_credit_limit_all_cards: { amount: 4_500_000, currency: 'usd' },
  years_of_credit_history: 8,
}

export const bankAccountData: Record<string, unknown> = {
  currency: 'usd',
  topic_ids: [bankTopic.id],
  topic_name: bankTopic.name,
  result: 'approved',
  account_type: 'savings',
  existing_relationship: true,
  bonus_amount: { amount: 30_000, currency: 'usd' },
  bonus_requirements: 'Direct deposit of $500 within 90 days',
  minimum_balance_requirement: { amount: 150_000, currency: 'usd' },
  direct_deposit_setup: true,
  application_date: '2026-04-02',
  credit_score_range: '740-799',
  stated_income_range: incomeRange,
}
