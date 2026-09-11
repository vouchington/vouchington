import type { MessageKey, Translator } from '@ts-shared/ui-messages'
import type { MembershipBenefitValue } from '@/types/api-responses'

export function isMembershipBenefitValue(value: unknown): value is MembershipBenefitValue {
  return typeof value === 'object' && value !== null && 'kind' in value
}

export function presentGroupLabel(id: string, t: Translator): string | null {
  switch (id) {
    case 'contribute':
      return t('extracted.memberships.benefitCatalog.groupContribute_0c11c1a2')
    case 'research':
      return t('extracted.memberships.benefitCatalog.groupResearch_0c11c1a4')
    case 'communities':
      return t('extracted.memberships.benefitCatalog.groupCommunities_0c11c1a1')
    case 'support':
      return t('extracted.memberships.benefitCatalog.groupSupport_0c11c1c0')
    case 'referrals':
      return t('extracted.memberships.benefitCatalog.groupReferrals_0c11c1a3')
    default:
      return null
  }
}

export function presentBenefitValue(
  value: MembershipBenefitValue,
  t: Translator,
): string | boolean | null {
  switch (value.kind) {
    case 'availability':
      return typeof value.included === 'boolean' ? value.included : null
    case 'quantity':
      if (!Number.isInteger(value.quantity) || value.quantity < 0) return null
      return value.quantity === 0
        ? t('extracted.memberships.benefitCatalog.none_0c11c1bb')
        : String(value.quantity)
    case 'access':
      if (value.access === 'immediate') {
        return t('extracted.memberships.benefitCatalog.immediate_0c11c1ba')
      }
      if (value.access === 'after_wait') {
        return t('extracted.memberships.benefitCatalog.afterWait_0c11c1b9')
      }
      return null
    case 'level':
      return presentLevel(value.level, t)
    default:
      return null
  }
}

function presentLevel(level: string, t: Translator): string | null {
  const keys: Record<string, MessageKey> = {
    none: 'extracted.memberships.benefitCatalog.none_0c11c1bb',
    standard: 'extracted.memberships.benefitCatalog.standard_0c11c1bc',
    more: 'extracted.memberships.benefitCatalog.more_0c11c1bd',
    most: 'extracted.memberships.benefitCatalog.most_0c11c1be',
    higher: 'extracted.memberships.benefitCatalog.higher_0c11c1bf',
    priority: 'extracted.memberships.benefitCatalog.priority_0c11c1c3',
    highest_priority: 'extracted.memberships.benefitCatalog.highestPriority_0c11c1c4',
  }
  const key = keys[level]
  return key ? t(key) : null
}
