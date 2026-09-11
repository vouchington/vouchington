import type { Translator } from '@ts-shared/ui-messages'
import type {
  MembershipBenefit,
  MembershipBenefitCatalog,
  MembershipBenefitPlan,
  MembershipBenefitValue,
} from '@/types/api-responses'
import type { PlanFeature } from './plan-card-data'
import { presentBenefitCopy } from './plan-benefit-copy'
import { isPlanBenefitIncluded } from './plan-benefit-inclusion'
import {
  isMembershipBenefitValue,
  presentBenefitValue,
  presentGroupLabel,
} from './plan-benefit-value-presentation'

export interface PresentedBenefitRow {
  id: string
  label: string
  tooltip: string
  free: string | boolean
  plus: string | boolean
  pro: string | boolean
}

export interface PresentedBenefitGroup {
  id: string
  label: string
  rows: PresentedBenefitRow[]
}

export function presentBenefitGroups(
  catalog: MembershipBenefitCatalog | null,
  t: Translator,
): PresentedBenefitGroup[] {
  if (!catalog) return []
  const groups: PresentedBenefitGroup[] = []
  for (const group of catalog.groups) {
    const rows: PresentedBenefitRow[] = []
    for (const benefit of group.benefits) {
      if (!benefit.placements.includes('comparison')) continue
      const row = presentBenefitRow(benefit, t)
      if (row) rows.push(row)
    }
    if (rows.length > 0) {
      const label = presentGroupLabel(group.id, t)
      if (label) groups.push({ id: group.id, label, rows })
    }
  }
  return groups
}

export function presentCardFeatures(
  catalog: MembershipBenefitCatalog | null,
  plan: MembershipBenefitPlan,
  t: Translator,
): PlanFeature[] {
  if (!catalog) return []
  const features: PlanFeature[] = []
  for (const group of catalog.groups) {
    for (const benefit of group.benefits) {
      if (!benefit.placements.includes('card')) continue
      const copy = presentBenefitCopy(benefit.id, t)
      if (!copy) continue
      const planValue = benefit.values[plan]
      if (!isMembershipBenefitValue(planValue)) continue
      const value = presentCardBenefitValue(planValue, t)
      if (value === null) continue
      features.push({
        label: `${copy.label}: ${value}`,
        tooltip: copy.tooltip,
        included: isPlanBenefitIncluded(planValue),
      })
    }
  }
  return features
}

function presentCardBenefitValue(value: MembershipBenefitValue, t: Translator): string | null {
  if (value.kind === 'availability') {
    if (typeof value.included !== 'boolean') return null
    return value.included
      ? t('extracted.memberships.planComparisonTable.included_ba829a98')
      : t('extracted.memberships.planComparisonTable.notIncluded_b665bfc2')
  }
  const presented = presentBenefitValue(value, t)
  return typeof presented === 'string' ? presented : null
}

function presentBenefitRow(benefit: MembershipBenefit, t: Translator): PresentedBenefitRow | null {
  const copy = presentBenefitCopy(benefit.id, t)
  if (!copy) return null
  if (
    !isMembershipBenefitValue(benefit.values.free) ||
    !isMembershipBenefitValue(benefit.values.plus) ||
    !isMembershipBenefitValue(benefit.values.pro)
  )
    return null
  const free = presentBenefitValue(benefit.values.free, t)
  const plus = presentBenefitValue(benefit.values.plus, t)
  const pro = presentBenefitValue(benefit.values.pro, t)
  if (free === null || plus === null || pro === null) return null
  return {
    id: benefit.id,
    ...copy,
    free,
    plus,
    pro,
  }
}
