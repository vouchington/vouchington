import { beginTransaction, read, write } from '@data-stores/psql'
import { recordPostPublicationChange } from '@services/post-publication/public'
import {
  claimPostPublicationDirtyWork,
  listAvailablePostPublicationDirtyWork,
} from '@services/post-publication/dirty-work'
import { listPublicationCandidatePage } from '@services/post-publication/publication-candidates'
import { listPostPublicationIdentityKeys } from '@services/post-publication/identity-keys'
import { seedUuid } from '../seed-data/common.mts'
import { runBroadPublicationScopeScenarios } from './post-publication-broad-scopes-3511.mts'
import { runDeepPublicationAncestry3511Scenario } from './post-publication-deep-ancestry-3511.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

/** One owned dirty scope over the seeded post corpus exercises each reconciliation page. */
export async function runPostPublicationSelection3511Scenarios(): Promise<void> {
  const postId = seedUuid(99_990, '05')
  const { rows: existing } = await read<{ id: string }>(
    `/* assertPostPublicationProbeUnowned */ SELECT id FROM post_publication_dirty_work
     WHERE post_identity_id = $1::uuid`,
    [postId],
  )
  if (existing.length > 0) throw new Error('Post-publication probe scope is already owned')

  await using transaction = await beginTransaction()
  const work = await recordPostPublicationChange(transaction, {
    scope: { type: 'post', postId },
    reason: 'post_updated',
    impactedPostIds: [postId],
    footprint: { priorPostSlug: 'explain-publication-prior-slug' },
  })
  await transaction.commit()
  try {
    registerScenarioContract('post-publication-available-work', {
      seededRows: { posts: 100_000 },
      expectations: [
        { kind: 'maxProcessedRows', relation: 'post_publication_dirty_work', max: 101 },
      ],
    })
    await runAndCapture(
      'post-publication-available-work',
      async () => {
        const page = await listAvailablePostPublicationDirtyWork(100)
        if (page.length !== 100) throw new Error('Expected a full available publication work page')
      },
      undefined,
      'listAvailablePostPublicationDirtyWork',
    )
    const claimed = await claimPostPublicationDirtyWork(work, 60)
    if (!claimed) throw new Error('Expected to claim owned publication work')

    registerScenarioContract('post-publication-candidate-page', {
      seededRows: { posts: 100_000 },
      expectations: [{ kind: 'maxProcessedRows', relation: 'posts', max: 1_100 }],
    })
    await runAndCapture(
      'post-publication-candidate-page',
      async () => {
        const page = await listPublicationCandidatePage(
          { ...claimed, cursor_post_id: uuidPredecessor(postId) },
          10,
        )
        if (!page.posts.some(post => post.id === postId))
          throw new Error('Expected the seeded post in the bounded publication candidate page')
      },
      undefined,
      'readRawPublicationCandidatePage',
    )

    registerScenarioContract('post-publication-root-hints', {
      seededRows: { posts: 100_000 },
      expectations: [
        { kind: 'maxProcessedRows', relation: 'post_publication_dirty_work_keys', max: 101 },
        { kind: 'maxProcessedRows', relation: 'posts', max: 102 },
      ],
    })
    await runAndCapture(
      'post-publication-root-hints',
      async () => {
        const page = await listPublicationCandidatePage(
          { ...claimed, cursor_post_id: uuidPredecessor(postId) },
          10,
        )
        if (!page.posts.some(post => post.id === postId))
          throw new Error('Expected owned post while measuring bounded root hints')
      },
      undefined,
      'readPublicationAncestorRootHints',
    )

    registerScenarioContract('post-publication-retained-key-page', {
      seededRows: { posts: 100_000 },
      expectations: [
        { kind: 'maxProcessedRows', relation: 'post_publication_post_identities', max: 11 },
      ],
    })
    await runAndCapture(
      'post-publication-retained-key-page',
      async () => {
        const page = await listPostPublicationIdentityKeys(claimed, 10)
        if (!page.identityKeys.some(key => key.value === 'explain-publication-prior-slug'))
          throw new Error('Expected retained prior slug in the publication key page')
      },
      undefined,
      'listPostPublicationIdentityKeys',
    )
  } finally {
    await write(
      `/* removePostPublicationSelection3511ProbeKeys */
       DELETE FROM post_publication_dirty_work_keys WHERE dirty_work_id = $1::uuid`,
      [work.id],
    )
    await write(
      `/* removePostPublicationSelection3511ProbeWork */
       DELETE FROM post_publication_dirty_work WHERE id = $1::uuid`,
      [work.id],
    )
  }

  await runBroadPublicationScopeScenarios(postId)
  await runDeepPublicationAncestry3511Scenario()
}

function uuidPredecessor(uuid: string): string {
  const value = (BigInt(`0x${uuid.replaceAll('-', '')}`) - 1n).toString(16).padStart(32, '0')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}
