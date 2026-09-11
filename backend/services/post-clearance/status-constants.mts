import type { ModeratorActionType } from '@services/moderator-actions'
import type { ClearanceStatus } from './types.mts'

export const CLEARANCE_CHANGE_TYPES = {
  approved: 'approve',
  rejected: 'reject',
  in_review: 'mark_in_review',
  pending: 'reset_to_pending',
} as const satisfies Record<ClearanceStatus, string>

export const CLEARANCE_MODLOG_ACTIONS: Partial<Record<ClearanceStatus, ModeratorActionType>> = {
  approved: 'approve',
  rejected: 'reject',
}
