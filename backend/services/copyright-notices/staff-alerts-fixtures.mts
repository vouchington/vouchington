import { randomBytes } from 'node:crypto'
import { encodeUuidCursorBefore } from '@voucha/test-helpers/modules/pagination/uuid-cursors'
import { insertCopyrightStaffAlertCase } from '@voucha/test-helpers/data-stores/psql/copyright-staff-alerts'
import type { PrivateUser } from '@voucha/types/entities/user'
import {
  approveCopyrightStaffAlertPolicy,
  listOpenCopyrightStaffAlerts,
  revokeCopyrightStaffAlertPolicy,
  syncCopyrightStaffAlertsFromRecovery,
} from './index.mts'

export async function withApprovedCopyrightStaffAlertPolicy<T>(
  actorId: string,
  body: () => Promise<T>,
): Promise<T> {
  await approveCopyrightStaffAlertPolicy({ approvedByUserId: actorId })
  try {
    return await body()
  } finally {
    await revokeCopyrightStaffAlertPolicy()
  }
}

export function copyrightStaffAlertModerator(user: PrivateUser): PrivateUser {
  return { ...user, roles: ['moderator'] }
}

/** Two notice ids at the top of UUID order, so a one-row page ends after the second id. */
function trailingCopyrightStaffAlertNoticeIds(): [string, string] {
  const suffix = randomBytes(5).toString('hex')
  return [`ffffffff-ffff-7fff-bfff-${suffix}00`, `ffffffff-ffff-7fff-bfff-${suffix}11`]
}

async function insertTrailingCopyrightStaffAlertCases(input: {
  imageId: string
  actorUserId: string
}): Promise<[string, string]> {
  const [lowerNoticeId, higherNoticeId] = trailingCopyrightStaffAlertNoticeIds()
  const [first, second] = await Promise.all([
    insertCopyrightStaffAlertCase({
      imageId: input.imageId,
      actorUserId: input.actorUserId,
      provisional: false,
      noticeId: lowerNoticeId,
    }),
    insertCopyrightStaffAlertCase({
      imageId: input.imageId,
      actorUserId: input.actorUserId,
      provisional: false,
      noticeId: higherNoticeId,
    }),
  ])
  return [first.noticeId, second.noticeId]
}

async function openTrailingCopyrightStaffAlertNoticeIds(input: {
  firstNoticeId: string
  noticeIds: readonly string[]
  currentUser: PrivateUser
}): Promise<string[]> {
  await syncCopyrightStaffAlertsFromRecovery({
    after: encodeUuidCursorBefore(input.firstNoticeId),
    limit: 1,
  })
  const open = await listOpenCopyrightStaffAlerts(input.currentUser, input.noticeIds)
  return [...new Set(open.map(alert => alert.copyright_notice_id))].sort()
}

export async function syncTrailingCopyrightStaffAlertPage(input: {
  imageId: string
  actorUserId: string
  currentUser: PrivateUser
}): Promise<{ noticeIds: string[]; openNoticeIds: string[] }> {
  const [firstNoticeId, secondNoticeId] = await insertTrailingCopyrightStaffAlertCases(input)
  const noticeIds = [firstNoticeId, secondNoticeId].sort()
  const openNoticeIds = await openTrailingCopyrightStaffAlertNoticeIds({
    firstNoticeId,
    noticeIds,
    currentUser: input.currentUser,
  })
  return { noticeIds, openNoticeIds }
}
