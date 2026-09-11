export function suppressedError(message: string): Error & { tags: { suppressLogging: true } } {
  const error = new Error(message) as Error & { tags: { suppressLogging: true } }
  error.tags = { suppressLogging: true }
  return error
}
