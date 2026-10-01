import type { MembershipBenefitCatalog } from '@/types/api-responses'
import catalog from './membership-benefit-catalog.generated.json'

// The build generator validates this snapshot with the canonical catalog producer.
export const builtMembershipBenefitCatalog = catalog as MembershipBenefitCatalog
