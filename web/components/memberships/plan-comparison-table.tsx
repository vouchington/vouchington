import type { Translator } from '@ts-shared/ui-messages'
import type { MembershipBenefitCatalog, MembershipPlanSku } from '@/types/api-responses'
import { formatMoney } from '@/lib/money'
import { PlanFeatureLabel } from './plan-feature-label'
import { CellValue } from './plan-comparison-table-cell-value'
import { presentBenefitGroups } from './plan-benefit-presentation'

const PLANS = [
  {
    nameKey: 'extracted.memberships.planComparisonTable.free_f411a1fb',
  },
  {
    nameKey: 'extracted.memberships.planComparisonTable.plus_8a784378',
  },
  {
    nameKey: 'extracted.memberships.planComparisonTable.pro_957b0b87',
  },
] as const

export function PlanComparisonTable({
  benefitCatalog,
  locale,
  plans,
  t,
}: {
  benefitCatalog: MembershipBenefitCatalog | null
  locale: string
  plans: Record<string, MembershipPlanSku[]>
  t: Translator
}) {
  const groups = presentBenefitGroups(benefitCatalog, t)
  const prices = {
    free: '$0',
    plus: monthlyPrice(plans.plus, locale),
    pro: monthlyPrice(plans.pro, locale),
  }
  return (
    <section aria-labelledby='compare-plans-heading'>
      <h2
        id='compare-plans-heading'
        data-pw='plan-comparison-heading'
        className='mb-4 text-xl font-bold sm:text-2xl'
      >
        {t('extracted.memberships.planComparisonTable.comparePlans_3c2bc4a1')}
      </h2>
      <div className='overflow-x-auto scrollbar-hide rounded-lg border'>
        <table
          data-pw='plan-comparison-table'
          className='w-full text-sm'
        >
          <thead>
            <tr className='border-b bg-muted/50'>
              <th className='px-4 py-3 text-left font-medium text-muted-foreground'>
                {t('extracted.memberships.planComparisonTable.feature_3d377ae9')}
              </th>
              <th
                scope='col'
                data-pw='plan-comparison-column-free'
                className='px-4 py-3 text-center font-semibold'
              >
                {t(PLANS[0].nameKey)}
              </th>
              <th
                scope='col'
                data-pw='plan-comparison-column-plus'
                className='px-4 py-3 text-center font-semibold'
              >
                {t(PLANS[1].nameKey)}
              </th>
              <th
                scope='col'
                data-pw='plan-comparison-column-pro'
                className='px-4 py-3 text-center font-semibold'
              >
                {t(PLANS[2].nameKey)}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className='bg-background'>
              <th
                scope='row'
                className='px-4 py-3 text-left font-normal'
              >
                {t('extracted.memberships.planComparisonTable.monthlyPrice_648c2cfb')}
              </th>
              <td className='px-4 py-3 text-center text-muted-foreground'>{prices.free}</td>
              <td className='px-4 py-3 text-center text-muted-foreground'>{prices.plus}</td>
              <td className='px-4 py-3 text-center text-muted-foreground'>{prices.pro}</td>
            </tr>
            {groups.map(group => (
              <PlanBenefitGroupRows
                key={group.id}
                group={group}
                t={t}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function PlanBenefitGroupRows({
  group,
  t,
}: {
  group: ReturnType<typeof presentBenefitGroups>[number]
  t: Translator
}) {
  return (
    <>
      <tr className='border-y bg-muted/50'>
        <th
          scope='row'
          className='px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground'
        >
          {group.label}
        </th>
        <td aria-hidden='true' />
        <td aria-hidden='true' />
        <td aria-hidden='true' />
      </tr>
      {group.rows.map((row, index) => (
        <tr
          key={row.id}
          data-pw='plan-comparison-row'
          className={index % 2 === 0 ? 'bg-background' : 'bg-muted/20'}
        >
          <th
            scope='row'
            className='px-4 py-3 text-left font-normal'
          >
            <PlanFeatureLabel
              label={row.label}
              tooltip={row.tooltip}
              className='h-auto justify-start p-0 text-left text-sm font-normal underline decoration-dotted underline-offset-2 hover:bg-transparent hover:text-foreground'
            />
          </th>
          <td className='px-4 py-3 text-center text-muted-foreground'>
            <CellValue
              value={row.free}
              t={t}
            />
          </td>
          <td className='px-4 py-3 text-center text-muted-foreground'>
            <CellValue
              value={row.plus}
              t={t}
            />
          </td>
          <td className='px-4 py-3 text-center text-muted-foreground'>
            <CellValue
              value={row.pro}
              t={t}
            />
          </td>
        </tr>
      ))}
    </>
  )
}

function monthlyPrice(skus: MembershipPlanSku[] | undefined, locale: string): string {
  const sku = skus?.find(candidate => candidate.interval === 'monthly')
  return sku ? formatMoney(sku.price, locale) : '—'
}
