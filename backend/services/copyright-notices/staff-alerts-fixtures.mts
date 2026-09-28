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

export async function syncTrailingCopyrightStaffAlertPage(input: {
  imageId: string
  actorUserId: string
  currentUser: PrivateUser
}): Promise<{ noticeIds: string[]; openNoticeIds: string[] }> {
  const [lowerNoticeId, higherNoticeId] = trailingCopyrightStaffAlertNoticeIds()
  const first = await insertCopyrightStaffAlertCase({
    imageId: input.imageId,
    actorUserId: input.actorUserId,
    provisional: false,
    noticeId: lowerNoticeId,
  })
  const second = await insertCopyrightStaffAlertCase({
    imageId: input.imageId,
    actorUserId: input.actorUserId,
    provisional: false,
    noticeId: higherNoticeId,
  })
  await syncCopyrightStaffAlertsFromRecovery({
    after: encodeUuidCursorBefore(first.noticeId),
    limit: 1,
  })
  const open = await listOpenCopyrightStaffAlerts(input.currentUser, [
    first.noticeId,
    second.noticeId,
  ])
  return {
    noticeIds: [first.noticeId, second.noticeId].sort(),
    openNoticeIds: [...new Set(open.map(alert => alert.copyright_notice_id))].sort(),
  }
}
