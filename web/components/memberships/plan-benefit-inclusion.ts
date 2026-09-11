import type { MembershipBenefitValue } from '@/types/api-responses'

export function isPlanBenefitIncluded(value: MembershipBenefitValue): boolean {
  switch (value.kind) {
    case 'availability':
      return value.included
    case 'quantity':
      return value.quantity > 0
    case 'level':
      return value.level !== 'none'
    case 'access':
      return true
    default:
      return false
  }
}
