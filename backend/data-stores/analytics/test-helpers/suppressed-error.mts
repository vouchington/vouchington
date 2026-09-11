// @data-stores/analytics cannot depend on @voucha/test-helpers: test-helpers itself depends on
// @data-stores/psql, and every backend service devDeps test-helpers for its tests, so an
// analytics -> test-helpers edge would close a workspace dependency cycle (disallowWorkspaceCycles).
// Straight duplicate of test-helpers' suppressed-error.mts for backend-firehose.test.mts, which
// only needs an Error shaped so on-error's suppressLogging tag is set.
export function suppressedError(message: string): Error & { tags: { suppressLogging: true } } {
  const error = new Error(message) as Error & { tags: { suppressLogging: true } }
  error.tags = { suppressLogging: true }
  return error
}
