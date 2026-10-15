import { createTestPost, type CreateTestPostOptions } from './services/posts/test-support.mts'
import { withEntityListenerCompletion } from './entity-listener-completion.mts'

/** Bind a fresh producer slug before its real post ID and original admission are available. */
export function createPostWithEntityListenerCompletion(options: CreateTestPostOptions = {}) {
  const slug = options.slug ?? `entity-listener-${crypto.randomUUID()}`
  return withEntityListenerCompletion([{ jobName: 'processPostCreated', postSlug: slug }], () =>
    createTestPost({ ...options, slug }),
  )
}
