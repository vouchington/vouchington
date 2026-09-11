import type { RefundableCharge } from '@/types/api-responses'

export interface MembershipRefundFormState {
  reason: string
  cancel: boolean
  amountStr: string
  note: string
}

export interface MembershipRefundFormProps {
  actorUserId: string
  userId: string
  charges: RefundableCharge[]
  onReload: () => void
}
