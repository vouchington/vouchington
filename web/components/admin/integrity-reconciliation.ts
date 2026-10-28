export type IntegrityReconciliationStatus = 'committed' | 'pending' | 'unknown'

export function isResolvedIntegrityFlag(flag: { resolved_at: string | null | undefined }): boolean {
  return Boolean(flag.resolved_at)
}

export function isRevokedIntegrityPenalty(penalty: {
  revoked_at: string | null | undefined
}): boolean {
  return Boolean(penalty.revoked_at)
}

export async function reconcileIntegrityExactRead<T>(input: {
  getExactState: () => Promise<T>
  mutationConfirmed: (state: T) => boolean
}): Promise<{ state?: T; status: IntegrityReconciliationStatus }> {
  try {
    const state = await input.getExactState()
    return {
      state,
      status: input.mutationConfirmed(state) ? 'committed' : 'pending',
    }
  } catch {
    return { status: 'unknown' }
  }
}

export function hasNewIntegrityPenalty(
  baselinePenaltyIds: ReadonlySet<string>,
  currentPenaltyIds: ReadonlySet<string>,
): boolean {
  for (const id of currentPenaltyIds) if (!baselinePenaltyIds.has(id)) return true
  return false
}
