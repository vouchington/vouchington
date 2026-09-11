import type { Post } from './types.mts'

export const BLOCKED_POST_TYPES: ReadonlySet<Post['post_type']> = new Set(['topic_recommendation'])
