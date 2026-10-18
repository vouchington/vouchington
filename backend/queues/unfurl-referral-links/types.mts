export type UnfurlDispatchCursor = {
  sweepStartedAt: string
  after?: { requestedAt: string; id: string }
}
