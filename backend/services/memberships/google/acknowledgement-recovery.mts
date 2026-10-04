import { getMembershipWorkLimit } from '../work-limits.mts'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  advanceGooglePlayRecoverySweep,
  beginGooglePlayRecoverySweep,
  pageGooglePlayRecoveryItems,
} from './recovery-cursor.mts'

export type GooglePlayAcknowledgementRecoveryBatch = {
  acknowledgementIds: string[]
  previousCursor: string | null
  previousUpperBound: string | null
  sweepUpperBound: string | null
  nextCursor: string | null
  completesSweep: boolean
}

export async function findDueGooglePlayAcknowledgementIds(): Promise<GooglePlayAcknowledgementRecoveryBatch> {
  const pageSize = getMembershipWorkLimit('google_cursor_page_size')
  const claimMinutes = getMembershipWorkLimit('verification_claim_minutes')
  const cursor = await beginGooglePlayRecoverySweep({
    cursorId: 'acknowledgements',
    findUpperBound: () => findAcknowledgementSweepUpperBound(claimMinutes),
  })
  const page = pageGooglePlayRecoveryItems(
    cursor,
    await findDueAcknowledgementsAfter(
      cursor.previousCursor,
      cursor.sweepUpperBound,
      pageSize,
      claimMinutes,
    ),
    pageSize,
  )
  return { ...page, acknowledgementIds: page.items.map(item => item.id) }
}

async function findDueAcknowledgementsAfter(
  cursor: string | null,
  upperBound: string | null,
  WORK_PAGE_SIZE: number,
  claimMinutes: number,
) {
  const { rows } = await write<{ id: string }>(sql`/* findDueGooglePlayAcknowledgementIds */
    SELECT id FROM membership_google_play_acknowledgements WHERE acknowledged_at IS NULL AND skipped_at IS NULL AND next_attempt_at <= CURRENT_TIMESTAMP
      AND (attempt_claim_token IS NULL OR attempt_claimed_at < CURRENT_TIMESTAMP - ${claimMinutes}::integer * INTERVAL '1 minute')
      AND (${cursor}::UUID IS NULL OR id > ${cursor}::UUID)
      AND (${upperBound}::UUID IS NULL OR id <= ${upperBound}::UUID)
    ORDER BY id LIMIT ${WORK_PAGE_SIZE + 1}`)
  return rows
}

async function findAcknowledgementSweepUpperBound(claimMinutes: number): Promise<string | null> {
  const { rows } = await write<{
    id: string | null
  }>(sql`/* findGooglePlayAcknowledgementSweepUpperBound */
    SELECT id FROM membership_google_play_acknowledgements
    WHERE acknowledged_at IS NULL AND skipped_at IS NULL AND next_attempt_at <= CURRENT_TIMESTAMP
      AND (attempt_claim_token IS NULL OR attempt_claimed_at < CURRENT_TIMESTAMP - ${claimMinutes}::integer * INTERVAL '1 minute')
    ORDER BY id DESC LIMIT 1`)
  return rows[0]?.id ?? null
}

export async function advanceGooglePlayAcknowledgementRecoveryCursor(
  batch: GooglePlayAcknowledgementRecoveryBatch,
): Promise<void> {
  await advanceGooglePlayRecoverySweep({ cursorId: 'acknowledgements', ...batch })
}
