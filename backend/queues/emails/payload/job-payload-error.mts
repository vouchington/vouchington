export class JobPayloadError extends Error {
  constructor(detail: string) {
    super(`Invalid email job payload: ${detail}`)
    this.name = 'JobPayloadError'
  }
}
