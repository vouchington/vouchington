import { createAutotaggerRegistration } from './classifier-run-autotagger.mts'
import { createCommunityModerationRegistration } from './classifier-run-community-moderation.mts'
import { createClassifierRunHandler, type ClassifierRunHandler } from './classifier-run-handler.mts'
import { createPostClassifierRegistration } from './classifier-run-post-classifier.mts'

/**
 * Every classifier served by the shared lifecycle. Adding one is a registration here plus its
 * adapter and input building; C9 registers the same way.
 */
const handlers: readonly ClassifierRunHandler[] = [
  createClassifierRunHandler(createPostClassifierRegistration()),
  createClassifierRunHandler(createAutotaggerRegistration()),
  createClassifierRunHandler(createCommunityModerationRegistration()),
]

export function listClassifierRunHandlers(): readonly ClassifierRunHandler[] {
  return handlers
}

export function getClassifierRunHandler(slug: string): ClassifierRunHandler {
  const handler = handlers.find(candidate => candidate.slug === slug)
  if (!handler) throw new Error(`No classifier run handler is registered for ${slug}`)
  return handler
}
