import type { ProjectionWork } from './story-post-related-url-projection-types.mts'
import {
  renewStoryPostRelatedUrlProjectionWorkLease,
  STORY_POST_RELATED_URL_PROJECTION_LEASE_RENEWAL_MS,
} from './story-post-related-url-projection-work.mts'

type LeaseRenewalDependencies = {
  renewalMs?: number
  renew?: typeof renewStoryPostRelatedUrlProjectionWorkLease
}

type LeaseRenewalState = {
  work: ProjectionWork
  renew: typeof renewStoryPostRelatedUrlProjectionWorkLease
  ownershipLost: boolean
  renewalError: Error | undefined
  renewal: Promise<void> | undefined
}

export async function runWithStoryPostRelatedUrlProjectionLeaseRenewal<T>(
  work: ProjectionWork,
  operation: (work: ProjectionWork) => Promise<T>,
  dependencies: LeaseRenewalDependencies = {},
): Promise<{ value: T } | null> {
  const state: LeaseRenewalState = {
    work,
    renew: dependencies.renew ?? renewStoryPostRelatedUrlProjectionWorkLease,
    ownershipLost: false,
    renewalError: undefined,
    renewal: undefined,
  }
  const renewalMs = dependencies.renewalMs ?? STORY_POST_RELATED_URL_PROJECTION_LEASE_RENEWAL_MS

  await renewStoryPostRelatedUrlProjectionLeaseNow(state)
  if (state.renewalError) throw state.renewalError
  if (state.ownershipLost) return null

  const timer = setInterval(renewStoryPostRelatedUrlProjectionLeaseOnInterval, renewalMs, state)
  timer.unref()
  try {
    const value = await operation(work)
    clearInterval(timer)
    await state.renewal
    await renewStoryPostRelatedUrlProjectionLeaseNow(state)
    if (state.renewalError) throw state.renewalError
    return state.ownershipLost ? null : { value }
  } finally {
    clearInterval(timer)
    await state.renewal
  }
}

function renewStoryPostRelatedUrlProjectionLeaseOnInterval(state: LeaseRenewalState): void {
  void renewStoryPostRelatedUrlProjectionLeaseNow(state)
}

async function renewStoryPostRelatedUrlProjectionLeaseNow(state: LeaseRenewalState): Promise<void> {
  if (state.ownershipLost) return
  if (state.renewal) {
    await state.renewal
    return
  }
  const renewal = performStoryPostRelatedUrlProjectionLeaseRenewal(state)
  state.renewal = renewal
  try {
    await renewal
  } finally {
    if (state.renewal === renewal) state.renewal = undefined
  }
}

async function performStoryPostRelatedUrlProjectionLeaseRenewal(
  state: LeaseRenewalState,
): Promise<void> {
  try {
    const accepted = await state.renew(state.work)
    if (!accepted) state.ownershipLost = true
  } catch (error) {
    state.ownershipLost = true
    state.renewalError =
      error instanceof Error ? error : new Error('Story projection lease renewal failed')
  }
}
