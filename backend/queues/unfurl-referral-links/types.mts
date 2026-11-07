export type UnfurlDispatchCursor = {
  sweepStartedAt: string
  after?: { requestedAt: string; id: string }
}
export type UnfurlReferralLinkEntry = { parentLinkId: string }
export type RemoveUnfurledChildrenForUserEntry = { userId: string }
