/** A local client configuration failure, before any provider request can be sent. */
export class MissingModelClientCredentialError extends Error {
  constructor(provider: 'OpenAI' | 'OpenRouter') {
    super(`${provider} client credentials are not configured.`)
    this.name = 'MissingModelClientCredentialError'
  }
}
