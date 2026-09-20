import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { CopyrightNoticeDeadlineRecord } from './types.mts'
import { createCounterNoticeForwardingInTransaction } from './counter-notice-forwarding.mts'

const NEW_YORK = 'America/New_York'
const NEW_YORK_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: NEW_YORK,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const NEW_YORK_MIDNIGHT_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: NEW_YORK,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
})

function newYorkDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = NEW_YORK_DATE_FORMATTER.formatToParts(date)
  const part = (type: string) => Number(parts.find(value => value.type === type)?.value)
  return { year: part('year'), month: part('month'), day: part('day') }
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function nthWeekday(year: number, month: number, weekday: number, nth: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  return dateKey(year, month, 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7)
}

function lastWeekday(year: number, month: number, weekday: number): string {
  const last = new Date(Date.UTC(year, month, 0))
  return dateKey(year, month, last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7))
}

function observedFixedHoliday(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day))
  const weekday = date.getUTCDay()
  if (weekday === 6) date.setUTCDate(date.getUTCDate() - 1)
  if (weekday === 0) date.setUTCDate(date.getUTCDate() + 1)
  return dateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

function federalHolidayKeys(year: number): Set<string> {
  return new Set([
    observedFixedHoliday(year, 1, 1),
    nthWeekday(year, 1, 1, 3),
    nthWeekday(year, 2, 1, 3),
    lastWeekday(year, 5, 1),
    observedFixedHoliday(year, 6, 19),
    observedFixedHoliday(year, 7, 4),
    nthWeekday(year, 9, 1, 1),
    nthWeekday(year, 10, 1, 2),
    observedFixedHoliday(year, 11, 11),
    nthWeekday(year, 11, 4, 4),
    observedFixedHoliday(year, 12, 25),
    observedFixedHoliday(year + 1, 1, 1),
  ])
}

function atNewYorkMidnight(year: number, month: number, day: number): Date {
  const intended = dateKey(year, month, day)
  let timestamp = Date.UTC(year, month - 1, day)
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = new Date(timestamp)
    const parts = NEW_YORK_MIDNIGHT_FORMATTER.formatToParts(candidate)
    const part = (type: string) => parts.find(value => value.type === type)?.value
    if (
      dateKey(Number(part('year')), Number(part('month')), Number(part('day'))) === intended &&
      part('hour') === '00'
    )
      return candidate
    timestamp += 3_600_000
  }
  throw new Error(`Unable to resolve New York midnight for ${intended}`)
}

function addFederalBusinessDays(receivedAt: Date, businessDays: number): Date {
  const start = newYorkDateParts(receivedAt)
  const cursor = new Date(Date.UTC(start.year, start.month - 1, start.day))
  let counted = 0
  while (counted < businessDays) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    const year = cursor.getUTCFullYear()
    const month = cursor.getUTCMonth() + 1
    const day = cursor.getUTCDate()
    const weekday = cursor.getUTCDay()
    if (
      weekday !== 0 &&
      weekday !== 6 &&
      !federalHolidayKeys(year).has(dateKey(year, month, day))
    ) {
      counted++
    }
  }
  return atNewYorkMidnight(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate())
}

function nextNewYorkMidnight(date: Date): Date {
  const local = newYorkDateParts(date)
  const next = new Date(Date.UTC(local.year, local.month - 1, local.day + 1))
  return atNewYorkMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())
}

export function calculateUsCounterNoticeRestorationWindow(receivedAt: Date): {
  earliest_restoration_at: Date
  escalation_at: Date
  restoration_deadline_at: Date
} {
  const escalationAt = addFederalBusinessDays(receivedAt, 14)
  return {
    earliest_restoration_at: addFederalBusinessDays(receivedAt, 10),
    escalation_at: escalationAt,
    restoration_deadline_at: nextNewYorkMidnight(escalationAt),
  }
}

export async function createCounterNoticeDeadline(input: {
  assessmentId: string
}): Promise<CopyrightNoticeDeadlineRecord> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    copyright_notice_id: string
    received_at: Date
    kind: string
    substantially_compliant: boolean
    jurisdiction: string
  }>(sql`/* createCounterNoticeDeadline:lockAssessment */
    SELECT s.copyright_notice_id, s.received_at, s.kind, a.substantially_compliant, n.jurisdiction
    FROM copyright_notice_submission_assessments a
    JOIN copyright_notice_submissions s ON s.id = a.copyright_notice_submission_id
    JOIN copyright_notices n ON n.id = s.copyright_notice_id
    WHERE a.id = ${input.assessmentId}
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_submission_assessments newer
        WHERE newer.supersedes_assessment_id = a.id
      )
      AND EXISTS (
        SELECT 1
        FROM copyright_notice_counter_notice_assessment_targets target
        WHERE target.copyright_notice_submission_assessment_id = a.id
      )
    FOR UPDATE OF n, a, s
  `)
  const qualifying = rows[0]
  assert(qualifying, 404, 'Copyright submission assessment not found')
  assert(
    qualifying.jurisdiction === 'us_dmca',
    422,
    'Only US DMCA counter-notices use this restoration clock',
  )
  assert(
    qualifying.kind === 'counter_notice',
    422,
    'Only a counter-notice can start restoration timing',
  )
  assert(qualifying.substantially_compliant, 422, 'Counter-notice is not substantially compliant')
  const window = calculateUsCounterNoticeRestorationWindow(qualifying.received_at)
  const result =
    await transaction<CopyrightNoticeDeadlineRecord>(sql`/* createCounterNoticeDeadline */
    INSERT INTO copyright_notice_deadlines (
      copyright_notice_id, qualifying_counter_notice_assessment_id, earliest_restoration_at,
      escalation_at, restoration_deadline_at
    ) VALUES (
      ${qualifying.copyright_notice_id}, ${input.assessmentId}, ${window.earliest_restoration_at},
      ${window.escalation_at}, ${window.restoration_deadline_at}
    )
    ON CONFLICT (qualifying_counter_notice_assessment_id) DO NOTHING
    RETURNING id, copyright_notice_id, qualifying_counter_notice_assessment_id,
      earliest_restoration_at, escalation_at, restoration_deadline_at, resolved_at, cancelled_at
  `)
  const deadline = result.rows[0]
  assert(deadline, 409, 'A restoration deadline already exists for this counter-notice')
  await createCounterNoticeForwardingInTransaction(
    { assessmentId: input.assessmentId, earliestRestorationAt: deadline.earliest_restoration_at },
    transaction,
  )
  await transaction(sql`/* createCounterNoticeDeadline:event */
    INSERT INTO copyright_notice_lifecycle_events (copyright_notice_id, event_type, metadata)
    VALUES (${qualifying.copyright_notice_id}, 'counter_notice_deadline_started', '{}'::jsonb)
  `)
  await transaction.commit()
  return deadline
}
