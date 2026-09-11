import type { User } from '@/types/user'

export const TOPIC_POST_SORT_OPTIONS = [
  { label: 'Following', value: 'following_new', description: 'Prioritize followed people' },
  { label: 'Hot', value: 'hot', description: 'Sort by trending score' },
  { label: 'New', value: 'new', description: 'Sort by most recent' },
]

const TOPIC_POST_SORT_VALUES = new Set(TOPIC_POST_SORT_OPTIONS.map(option => option.value))
const STANDARD_POST_SORT_VALUES = new Set(['hot', 'new', 'relevance'])

export function getTopicPostSort(rawSort: unknown, currentUser: User | null | undefined): string {
  if (rawSort === 'relevance') return 'relevance'
  if (typeof rawSort === 'string' && TOPIC_POST_SORT_VALUES.has(rawSort)) {
    return rawSort === 'following_new' && !currentUser ? 'new' : rawSort
  }
  return currentUser ? 'following_new' : 'new'
}

export function getStandardPostSort(rawSort: unknown): string {
  return typeof rawSort === 'string' && STANDARD_POST_SORT_VALUES.has(rawSort) ? rawSort : 'new'
}
