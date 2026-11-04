export class TopicImportInProgressError extends Error {
  readonly retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super('Topic recommendation is in progress')
    this.name = 'TopicImportInProgressError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export function clientErrorMessage(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null || !('status' in err)) return undefined
  const status = (err as { status: unknown }).status
  if (typeof status !== 'number' || status < 400 || status >= 500) return undefined
  return err instanceof Error ? err.message : 'Unknown error'
}
