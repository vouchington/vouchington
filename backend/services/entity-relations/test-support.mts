import { afterAll, beforeAll } from 'vitest'
import { beginTransaction } from '@data-stores/psql'
import {
  getRegisteredBlockedHostnameGuard,
  registerBlockedHostnameGuard,
  unregisterBlockedHostnameGuardForTest,
} from './blocked-hostname-guard-registry.mts'
import {
  getRegisteredReferralLinkGuard,
  registerReferralLinkGuard,
  unregisterReferralLinkGuardForTest,
} from './referral-link-guard-registry.mts'
import {
  getRegisteredPostRelatedUrlsGuard,
  registerPostRelatedUrlsGuard,
  unregisterPostRelatedUrlsGuardForTest,
} from './post-related-urls-guard-registry.mts'
import { recordPostTopicRelationPublicationChanges } from './post-topic-publication.mts'

export async function recordTestPostTopicRelationPublicationChanges(
  relationTable: string,
  changes: ReadonlyArray<{ subject_id: string; object_id: string }>,
): Promise<void> {
  await using query = await beginTransaction()
  await recordPostTopicRelationPublicationChanges(query, relationTable, changes)
  await query.commit()
}

/**
 * Register no-op url guards for an entity-relations test suite that writes url relations
 * without asserting guard behavior. The real guards live in @services/urls,
 * @services/referral-program-link-validations, and @services/posts — all of which depend on
 * entity-relations, so importing them from this package's own tests would close a workspace
 * cycle. The backend-data-stores project runs with isolate: false, meaning registry state is
 * shared across test files in a fork — the previous guards are captured in beforeAll and
 * restored in afterAll so the no-ops never leak into other files' tests.
 *
 * Call inside a describe block.
 */
export function stubUrlGuardsForSuite(): void {
  let restoreUrlGuards: (() => void) | null = null

  beforeAll(() => {
    restoreUrlGuards = stubUrlGuardsForTest()
  })

  afterAll(() => {
    restoreUrlGuards?.()
    restoreUrlGuards = null
  })
}

export function stubUrlGuardsForTest(): () => void {
  const previousBlockedHostnameGuard = captureGuard(getRegisteredBlockedHostnameGuard)
  const previousReferralLinkGuard = captureGuard(getRegisteredReferralLinkGuard)
  const previousPostRelatedUrlsGuard = captureGuard(getRegisteredPostRelatedUrlsGuard)

  registerBlockedHostnameGuard(async () => {})
  registerReferralLinkGuard(async () => {})
  registerPostRelatedUrlsGuard(async () => {})

  return () => {
    restoreGuard(
      previousBlockedHostnameGuard,
      registerBlockedHostnameGuard,
      unregisterBlockedHostnameGuardForTest,
    )
    restoreGuard(
      previousReferralLinkGuard,
      registerReferralLinkGuard,
      unregisterReferralLinkGuardForTest,
    )
    restoreGuard(
      previousPostRelatedUrlsGuard,
      registerPostRelatedUrlsGuard,
      unregisterPostRelatedUrlsGuardForTest,
    )
  }
}

function captureGuard<T>(getGuard: () => T): T | null {
  try {
    return getGuard()
  } catch {
    return null
  }
}

function restoreGuard<T>(
  previousGuard: T | null,
  registerGuard: (guard: T) => void,
  unregisterGuard: () => void,
) {
  if (previousGuard) {
    registerGuard(previousGuard)
    return
  }
  unregisterGuard()
}
