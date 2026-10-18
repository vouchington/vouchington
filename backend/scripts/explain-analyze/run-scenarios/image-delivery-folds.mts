import { beginTransaction } from '@data-stores/psql'
import {
  assertImagesReadyForSurface,
  lockImageDeliveryMutation,
  lockUserProfileImageOwners,
} from '@services/media-delivery-safety'
import { lockPostImageAdmission } from '@services/posts/prepare-locked-image-update'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

type Transaction = Awaited<ReturnType<typeof beginTransaction>>

// Seeded by seedViewPostsHydration: ready images (tag d1), two per post (tag 05), one placement each.
const imageIds = (count: number) => Array.from({ length: count }, (_, i) => seedUuid(i, 'd1'))

// Each folded statement runs its production caller inside a rolled-back transaction, so the
// transaction-local delivery contract holds and no lock outlives the capture.
async function inRolledBackTransaction(work: (tx: Transaction) => Promise<unknown>) {
  await using transaction = await beginTransaction()
  await work(transaction)
  await transaction.rollback()
}

// One statement takes every sorted advisory key (1 post, 2 images, 2 placements) and records the
// authority marker. EXPLAIN's function counters cover only user-defined functions, so the built-in
// pg_advisory_xact_lock and set_config calls cannot be capped; capturing the statement still
// gates its plan and keeps the exact folded text under plan review.
async function runDeliveryMutationAdvisory(): Promise<void> {
  await runAndCapture(
    'image-delivery-mutation-advisory',
    () =>
      inRolledBackTransaction(tx =>
        lockImageDeliveryMutation(tx, { postIds: [seedUuid(0, '05')], imageIds: imageIds(2) }),
      ),
    undefined,
    'lockImageDeliveryMutation:advisory',
  )
}

// Owner-domain keys for ten users in one statement, with the authority marker.
async function runSurfaceOwnerDomains(): Promise<void> {
  await runAndCapture(
    'image-surface-owner-domains',
    () =>
      inRolledBackTransaction(tx =>
        lockUserProfileImageOwners(
          Array.from({ length: 10 }, (_, i) => seedUuid(i, '01')),
          tx,
        ),
      ),
    undefined,
    'lockSurfaceOwnerDomains',
  )
}

// Share-lock and readiness check for ten images by primary key, with the authority marker.
async function runImagesReadyForSurface(): Promise<void> {
  registerScenarioContract('image-ready-for-surface', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['images_pkey'] },
      { kind: 'maxProcessedRows', relation: 'images', max: 12 },
    ],
  })
  await runAndCapture(
    'image-ready-for-surface',
    () => inRolledBackTransaction(tx => assertImagesReadyForSurface(imageIds(10), tx)),
    undefined,
    'assertImagesReadyForSurface',
  )
}

// The post-image admission share lock folds the authority marker into its images read.
async function runPostImageLock(): Promise<void> {
  registerScenarioContract('post-image-lock', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['images_pkey'] },
      { kind: 'maxProcessedRows', relation: 'images', max: 12 },
    ],
  })
  await runAndCapture(
    'post-image-lock',
    () => inRolledBackTransaction(tx => lockPostImageAdmission(tx, imageIds(10))),
    undefined,
    'setPostImages:lockImages',
  )
}

export async function runImageDeliveryFoldScenarios(): Promise<void> {
  await runDeliveryMutationAdvisory()
  await runSurfaceOwnerDomains()
  await runImagesReadyForSurface()
  await runPostImageLock()
}
