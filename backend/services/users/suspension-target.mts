import assert from 'http-assert'
import { isModerationStaff, isOfficialAccount } from './authorization.mts'
import type { PrivateUser } from './types.mts'

export function assertSuspensionTarget(
  actor: PrivateUser,
  target: PrivateUser,
  staffTargets: 'allow' | 'refuse',
): void {
  assert(actor.id !== target.id, 422, 'Cannot suspend yourself')
  if (staffTargets === 'refuse')
    assert(
      !isModerationStaff(target) && !isOfficialAccount(target),
      422,
      'Staff and official accounts require human suspension review',
    )
}
