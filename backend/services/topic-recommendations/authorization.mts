import type { PrivateUser } from '@voucha/types/entities/user'
import type { TopicRecommendationPost } from './types.mts'

export function currentUserCanManageRecommendations(currentUser: PrivateUser | null): boolean {
  return currentUser?.roles.includes('administrator') ?? false
}

export function currentUserCanViewTopicRecommendation(
  currentUser: PrivateUser | null,
  recommendation: TopicRecommendationPost | null,
): boolean {
  return Boolean(currentUser && recommendation)
}

export function currentUserCanEditTopicRecommendation(
  currentUser: PrivateUser | null,
  recommendation: TopicRecommendationPost | null,
): boolean {
  if (!currentUser || !recommendation) return false
  if (currentUserCanManageRecommendations(currentUser)) return true
  return recommendation.created_by_id === currentUser.id
}

export function currentUserCanWithdrawTopicRecommendation(
  currentUser: PrivateUser | null,
  recommendation: TopicRecommendationPost | null,
): boolean {
  if (!currentUser || !recommendation) return false
  if (currentUserCanManageRecommendations(currentUser)) return true
  return recommendation.created_by_id === currentUser.id
}
