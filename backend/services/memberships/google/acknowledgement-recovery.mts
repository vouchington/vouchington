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
  const cursor = await beginGooglePlayRecoverySweep({
    cursorId: 'acknowledgements',
    findUpperBound: () => findAcknowledgementSweepUpperBound(),
  })
  const page = pageGooglePlayRecoveryItems(
    cursor,
    await findDueAcknowledgementsAfter(cursor.previousCursor, cursor.sweepUpperBound, pageSize),
    pageSize,
  )
  return { ...page, acknowledgementIds: page.items.map(item => item.id) }
}

async function findDueAcknowledgementsAfter(
  cursor: string | null,
  upperBound: string | null,
  WORK_PAGE_SIZE: number,
) {
  const { rows } = await write<{ id: string }>(sql`/* findDueGooglePlayAcknowledgementIds */
    SELECT membership_google_play_acknowledgement_id AS id FROM membership_google_play_acknowledgement_work_items
    WHERE completed_at IS NULL AND available_at <= clock_timestamp()
      AND (lease_token IS NULL OR lease_expires_at <= clock_timestamp())
      AND (${cursor}::UUID IS NULL OR membership_google_play_acknowledgement_id > ${cursor}::UUID)
      AND (${upperBound}::UUID IS NULL OR membership_google_play_acknowledgement_id <= ${upperBound}::UUID)
    ORDER BY id LIMIT ${WORK_PAGE_SIZE + 1}`)
  return rows
}

async function findAcknowledgementSweepUpperBound(): Promise<string | null> {
  const { rows } = await write<{
    id: string | null
  }>(sql`/* findGooglePlayAcknowledgementSweepUpperBound */
    SELECT membership_google_play_acknowledgement_id AS id FROM membership_google_play_acknowledgement_work_items
    WHERE completed_at IS NULL AND available_at <= clock_timestamp()
      AND (lease_token IS NULL OR lease_expires_at <= clock_timestamp())
    ORDER BY id DESC LIMIT 1`)
  return rows[0]?.id ?? null
}

export async function advanceGooglePlayAcknowledgementRecoveryCursor(
  batch: GooglePlayAcknowledgementRecoveryBatch,
): Promise<void> {
  await advanceGooglePlayRecoverySweep({ cursorId: 'acknowledgements', ...batch })
}
