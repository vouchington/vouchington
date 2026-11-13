import { expect } from 'vitest'
import type { TerritorialActors } from './services/copyright-notices/territorial-routes.mts'
import { readTestCopyrightStaffCase } from './services/copyright-notices/staff-case.mts'
import { encodeScopedTierPreciseUuidCursor } from '@modules/pagination'
import { copyrightStaffQueueCursorScope } from '../services/copyright-notices/read-models-staff.mts'
import { copyrightQueueAnchors } from './copyright-staff-queue-keys.mts'
import type { TerritorialCopyrightAcknowledgment } from '../services/copyright-notices/territorial-acknowledgment.mts'
import type { receiveTestTerritorialDecisionNotice } from './territorial-decision-reopening.mts'

/** Acknowledged staff projection retains claimant contact and the exact receipt channel policy. */
export async function assertTerritorialInitialStaffCase(
  jurisdiction: 'eu_dsa' | 'uk',
  notice: Awaited<ReturnType<typeof receiveTestTerritorialDecisionNotice>>,
  hostedUseUrl: string,
  acknowledgment: TerritorialCopyrightAcknowledgment,
) {
  const staffCase = await readTestCopyrightStaffCase(notice.noticeId)
  expect(staffCase).toMatchObject({
    id: notice.noticeId,
    jurisdiction: jurisdiction,
    claimant: { contact: notice.contact },
    work_description: notice.contentDescription,
    form_review: null,
    targets: [],
    evidence: [],
    restrictions: [],
    appeals: [],
    counter_notices: [],
    legal_holds: [],
    action_intents: [],
    staydown_matches: [],
    email_correspondence: [],
    territorial: {
      hosted_use_url: hostedUseUrl,
      grounds: notice.grounds,
      acknowledgment: {
        attempt_count: acknowledgment.attempt_count,
        acknowledged_at: acknowledgment.acknowledged_at,
        escalated: false,
      },
      reopened_at: null,
      decision: null,
    },
  })
  expect(
    (staffCase?.delivery_intents ?? [])
      .flatMap(intent => (intent.delivery_kind === 'claimant_receipt' ? [intent.channel] : []))
      .toSorted(),
  ).toEqual(jurisdiction === 'eu_dsa' ? ['email', 'in_app'] : [])
  expect(staffCase?.territorial?.acknowledgment.acknowledged_at).toEqual(
    acknowledgment.acknowledged_at,
  )
}

export async function findQueuedCase(
  request: TerritorialActors['staffRequest'],
  noticeId: string,
): Promise<{ id: string; reasons: string[] }> {
  // These owned receipts have no trusted-flagger provenance, so their native tuple is boost-independent.
  const [anchor] = await copyrightQueueAnchors([noticeId], false)
  if (!anchor) throw new Error('Owned territorial queue anchor disappeared')
  const hex = (BigInt(`0x${noticeId.replaceAll('-', '')}`) - 1n).toString(16).padStart(32, '0')
  const preceding = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  const after = encodeScopedTierPreciseUuidCursor(
    anchor.timestamp,
    anchor.tier,
    preceding,
    copyrightStaffQueueCursorScope,
  )
  const response = await request
    .get(`/api/v1/copyright-notices/review-queue?limit=1&after=${encodeURIComponent(after)}`)
    .expect(200)
  const page = response.body as { copyright_notices: Array<{ id: string; reasons: string[] }> }
  expect(page.copyright_notices.map(row => row.id)).toEqual([noticeId])
  const item = page.copyright_notices[0]
  if (!item) throw new Error(`Territorial notice ${noticeId} is not queued`)
  return item
}
