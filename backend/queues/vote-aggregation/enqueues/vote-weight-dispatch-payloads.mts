import type {
  VoteWeightAgeMilestonesData,
  VoteWeightDispatchWindow,
  VoteWeightDirtyMarkersData,
  VoteWeightFamilySourceChangesData,
  VoteWeightMembershipExpirationsData,
  VoteWeightRejectedEvidenceKeyset,
} from '@queues/background/enqueues/vote-weight-dispatch-types'

function safeWindow(window: VoteWeightDispatchWindow): VoteWeightDispatchWindow {
  return {
    windowStart: window.windowStart,
    windowEnd: window.windowEnd,
  }
}

function safeTimestampKeyset(
  keyset: VoteWeightRejectedEvidenceKeyset,
): VoteWeightRejectedEvidenceKeyset {
  return {
    at: keyset.at,
    id: keyset.id,
    ...(keyset.afterSourceId === undefined ? {} : { afterSourceId: keyset.afterSourceId }),
  }
}

export function safeAgeMilestonesData(
  data: VoteWeightAgeMilestonesData,
): VoteWeightAgeMilestonesData {
  return {
    ...(data.window === undefined ? {} : { window: safeWindow(data.window) }),
    ...(data.milestoneIndex === undefined ? {} : { milestoneIndex: data.milestoneIndex }),
    ...(data.afterId === undefined ? {} : { afterId: data.afterId }),
  }
}

export function safeMembershipExpirationsData(
  data: VoteWeightMembershipExpirationsData,
): VoteWeightMembershipExpirationsData {
  return {
    ...(data.window === undefined ? {} : { window: safeWindow(data.window) }),
    ...(data.after === undefined ? {} : { after: { at: data.after.at, id: data.after.id } }),
  }
}

export function safeFamilySourceChangesData(
  data: VoteWeightFamilySourceChangesData,
): VoteWeightFamilySourceChangesData {
  return {
    ...(data.window === undefined ? {} : { window: safeWindow(data.window) }),
    ...(data.branches === undefined
      ? {}
      : {
          branches: {
            ...(data.branches.updated_at === undefined
              ? {}
              : {
                  updated_at:
                    data.branches.updated_at === null
                      ? null
                      : safeTimestampKeyset(data.branches.updated_at),
                }),
            ...(data.branches.effective_at === undefined
              ? {}
              : {
                  effective_at:
                    data.branches.effective_at === null
                      ? null
                      : safeTimestampKeyset(data.branches.effective_at),
                }),
            ...(data.branches.expires_at === undefined
              ? {}
              : {
                  expires_at:
                    data.branches.expires_at === null
                      ? null
                      : safeTimestampKeyset(data.branches.expires_at),
                }),
            ...(data.branches.rejected_at === undefined
              ? {}
              : {
                  rejected_at:
                    data.branches.rejected_at === null
                      ? null
                      : safeTimestampKeyset(data.branches.rejected_at),
                }),
          },
        }),
  }
}

export function safeDirtyMarkersData(data: VoteWeightDirtyMarkersData): VoteWeightDirtyMarkersData {
  return { ...(data.afterId === undefined ? {} : { afterId: data.afterId }) }
}
