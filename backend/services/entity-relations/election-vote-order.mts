export type BidirectionalElectionVoteWrite<Value> = {
  relationTable: string
  relationIds: readonly string[]
  value: Value
}

/**
 * Orders both directions before they acquire transaction-scoped vote advisory locks.
 * Inverse callers therefore serialize their otherwise identical relation-id sets identically.
 */
export function orderBidirectionalElectionVoteWrites<Value>(
  writes: readonly BidirectionalElectionVoteWrite<Value>[],
): BidirectionalElectionVoteWrite<Value>[] {
  return [...writes].toSorted((left, right) => {
    const leftKey = createElectionVoteLockOrderKey(left)
    const rightKey = createElectionVoteLockOrderKey(right)
    return leftKey.localeCompare(rightKey)
  })
}

function createElectionVoteLockOrderKey(write: BidirectionalElectionVoteWrite<unknown>): string {
  return `${write.relationTable}\u0000${[...write.relationIds].toSorted().join('\u0000')}`
}
