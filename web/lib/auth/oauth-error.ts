export class OAuthCancelledError extends Error {
  constructor(provider: string, reason?: string) {
    super(reason ?? `${provider} login cancelled`)
    this.name = 'OAuthCancelledError'
  }
}
