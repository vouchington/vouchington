import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CopyrightCasePurgeJobData } from '../queues/psql/types.mts'
import { createTestUser } from './index.mts'
import { createCopyrightNoticeForManualAssociation } from './copyright-email-manual-association.mts'
import { addCopyrightCasePurgeFixtureParty } from './services/copyright-notices/retention-case-purge-fixture.mts'
import { appendTestCopyrightNoticeSubmission } from './copyright-notice-submissions.mts'
import { addRetentionArtifact } from './services/copyright-notices/retention-minimal-case.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { readCopyrightPurgeCaseClock } from './copyright-account-hold-race-state.mts'
import { runCopyrightCasePurgePage } from '../services/copyright-notices/retention-case-purge-page.mts'
import { destructiveHoldNow } from './copyright-destructive-hold-scene.mts'

export type MarkerHoldTiming = 'marker' | 'claim' | 'proof' | 'version_list' | 'empty_version_list'

/** Committed prerequisites for the actual marker, claim and physical deletion page subjects. */
export async function createCopyrightMarkerHoldScene(timing: MarkerHoldTiming) {
  const admin = await createTestUser({ administrator: true })
  const party = await createTestUser()
  const noticeId = await createCopyrightNoticeForManualAssociation()
  await addCopyrightCasePurgeFixtureParty(noticeId, party.id)
  let key: string | undefined
  if (timing !== 'marker') {
    const submission = await appendTestCopyrightNoticeSubmission({
      noticeId,
      kind: 'notice',
      sourceKind: 'staff',
      submittedByUserId: admin.id,
      receivedAt: new Date(),
      bodyCiphertext: 'Owned retained physical evidence.',
    })
    key = await addRetentionArtifact(submission.id)
  }
  const readState = async () => {
    const { rows } = await write<{ id: string; generation: string; claimed: boolean }>(sql`
      /* createCopyrightMarkerHoldScene:registry */
      SELECT id, reference_generation::text AS generation, is_deletion_claimed AS claimed
      FROM copyright_notice_storage_objects WHERE storage_key = ${key ?? null}`)
    return {
      aggregate: await getCopyrightNoticePrivateAggregate(noticeId),
      clock: await readCopyrightPurgeCaseClock(noticeId),
      storage: rows[0] ?? null,
    }
  }
  const first = await runCopyrightCasePurgePage(
    {
      noticeId,
      phase: 'parties',
      phaseIndex: 0,
      afterId: null,
      legalClockAt: null,
      proofVersion: null,
    },
    destructiveHoldNow,
  )
  const proof = (await readState()).storage
  let data: CopyrightCasePurgeJobData = {
    ...first.data,
    phase: 'evidence',
    phaseIndex: timing === 'marker' ? 2 : 0,
  }
  if (proof)
    data.evidenceOwner = {
      objectId: proof.id,
      generation: proof.generation,
      family: 'intakes',
      afterId: null,
    }
  if (timing !== 'marker' && timing !== 'claim') {
    const claimed = await runCopyrightCasePurgePage(data, destructiveHoldNow)
    data = claimed.data
  }
  const before = await readState()
  if (!before.aggregate || !before.clock) throw new Error('Owned evidence case is missing')
  if (timing !== 'marker' && !before.storage) throw new Error('Owned evidence registry is missing')
  return { admin, party, noticeId, key, data, before, readState }
}
