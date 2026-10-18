export class RssFeedDiscoveryPendingError extends Error {
  constructor() {
    super('RSS feed HTML discovery is pending')
  }
}
