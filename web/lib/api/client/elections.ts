'use client'

import { clientApi } from './instance'

export type VotePolicy = 'sentiment' | 'recommendation' | 'relation' | 'moderation'
export type SentimentChoice = 'vouch' | 'like' | 'neutral' | 'dislike' | 'disavow'
export type RecommendationChoice = 'support' | 'oppose'
export type RelationChoice = 'confirm' | 'dispute'
export type ModerationChoice = 'accurate' | 'inaccurate'
export type ElectionVoteChoice =
  | SentimentChoice
  | RecommendationChoice
  | RelationChoice
  | ModerationChoice

export function isRecommendationChoice(
  choice: ElectionVoteChoice | undefined,
): choice is RecommendationChoice {
  return choice === 'support' || choice === 'oppose'
}

export function isSentimentChoice(
  choice: ElectionVoteChoice | undefined,
): choice is SentimentChoice {
  return (
    choice === 'vouch' ||
    choice === 'like' ||
    choice === 'neutral' ||
    choice === 'dislike' ||
    choice === 'disavow'
  )
}

export type ChoiceForPolicy<P extends VotePolicy> = P extends 'sentiment'
  ? SentimentChoice
  : P extends 'recommendation'
    ? RecommendationChoice
    : P extends 'relation'
      ? RelationChoice
      : ModerationChoice

type VoteEntityType =
  | 'posts'
  | 'topics'
  | 'hostnames'
  | 'agent-moderations'
  | 'entity-relations'
  | 'rss-feed-items'

export async function submitVote<P extends VotePolicy>(
  entityType: VoteEntityType,
  id: string,
  choice: ChoiceForPolicy<P>,
): Promise<void> {
  await clientApi.put(`/api/v1/${entityType}/${encodeURIComponent(id)}/vote`, { choice })
}

export async function clearVote(entityType: VoteEntityType, id: string): Promise<void> {
  await clientApi.delete(`/api/v1/${entityType}/${encodeURIComponent(id)}/vote`)
}

export const submitPostVote = (id: string, choice: SentimentChoice) =>
  submitVote<'sentiment'>('posts', id, choice)
export const clearPostVote = (id: string) => clearVote('posts', id)
export const submitPostRecommendationVote = (id: string, choice: RecommendationChoice) =>
  submitVote<'recommendation'>('posts', id, choice)
export const submitTopicVote = (id: string, choice: SentimentChoice) =>
  submitVote<'sentiment'>('topics', id, choice)
export const clearTopicVote = (id: string) => clearVote('topics', id)
export const submitHostnameVote = (id: string, choice: SentimentChoice) =>
  submitVote<'sentiment'>('hostnames', id, choice)
export const clearHostnameVote = (id: string) => clearVote('hostnames', id)
export const submitRssFeedItemVote = (id: string, choice: SentimentChoice) =>
  submitVote<'sentiment'>('rss-feed-items', id, choice)
export const clearRssFeedItemVote = (id: string) => clearVote('rss-feed-items', id)
export const submitAgentModerationVote = (id: string, choice: ModerationChoice) =>
  submitVote<'moderation'>('agent-moderations', id, choice)
export const clearAgentModerationVote = (id: string) => clearVote('agent-moderations', id)
export async function submitUserVouchVote(id: string, choice: SentimentChoice): Promise<void> {
  await clientApi.put(`/api/v1/users/${encodeURIComponent(id)}/vouch-vote`, { choice })
}
export async function clearUserVouchVote(id: string): Promise<void> {
  await clientApi.delete(`/api/v1/users/${encodeURIComponent(id)}/vouch-vote`)
}
