import type { CommentTreeViewModel } from './comment-tree-view-model'

// Every per-comment record the descendants response carries besides the posts, their rendered
// markdown and the results. A fetched page merges all of them, so nothing a node reads is dropped.
const SIDECAR_KEYS = [
  'post_elections',
  'election_votes',
  'post_moderations',
  'agent_moderation_elections',
  'posts_metrics',
  'bookmarks',
] as const
export type SidecarKey = (typeof SIDECAR_KEYS)[number]
export type Sidecars = { [K in SidecarKey]: NonNullable<CommentTreeViewModel[K]> }
// Fails to compile when the response gains a sidecar this list does not merge.
const allSidecarsMerged: Exclude<
  keyof CommentTreeViewModel,
  SidecarKey | 'results' | 'posts' | 'markdown_to_html'
> extends never
  ? true
  : never = true
void allSidecarsMerged
export const EMPTY_SIDECARS = Object.fromEntries(SIDECAR_KEYS.map(key => [key, {}])) as Sidecars

export function mergeSidecars(base: Partial<Sidecars>, page: Partial<Sidecars>): Sidecars {
  return Object.fromEntries(
    SIDECAR_KEYS.map(key => [key, { ...base[key], ...page[key] }]),
  ) as Sidecars
}
