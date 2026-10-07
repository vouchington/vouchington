// A tool may discover a limiter refusal only after authorization and target lookup. The MCP
// adapter translates this typed outcome into its in-band error and audit/usage effects.
export class ToolRateLimitError extends Error {
  readonly retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super('Rate limit exceeded')
    this.retryAfterSeconds = retryAfterSeconds
  }
}
