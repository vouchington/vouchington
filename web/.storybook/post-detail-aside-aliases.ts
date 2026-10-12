import { fileURLToPath } from 'node:url'
import type { Alias } from 'vite'

export const postDetailAsideAliases: Alias[] = [
  '@/components/posts/post-follow-context',
  '@/components/posts/post-review-referral-links-aside',
  '@/components/tags/post-related-topics-aside',
  '@/components/tags/post-related-posts-aside',
  '@/components/tags/post-related-urls-aside',
  '@/components/asides/hn-discussions-post-aside',
].map(find => ({
  find,
  replacement: fileURLToPath(new URL('../storybook/mocks/post-detail-asides.tsx', import.meta.url)),
}))

export const postDetailAlias: Alias = {
  find: '@/components/posts/post-detail',
  replacement: fileURLToPath(new URL('../storybook/mocks/post-detail.tsx', import.meta.url)),
}
