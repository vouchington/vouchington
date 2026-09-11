import { beforeAll, describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { createTranslator, type Translator } from '@ts-shared/ui-messages'
import enMessages from '@ts-shared/ui-messages/messages/en'
import { PlanComparisonTable } from './plan-comparison-table'
import type { MembershipBenefitCatalog, MembershipPlanSku } from '@/types/api-responses'
import plansFixture from '../../../api-fixtures/v1/responses/native.memberships.plans.default.json'

function Wrapper({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>
}

const BENEFIT_CATALOG: MembershipBenefitCatalog = {
  version: 1,
  groups: [
    {
      id: 'contribute',
      benefits: [
        {
          id: 'public_contribution_access',
          placements: ['card', 'comparison'],
          values: {
            free: { kind: 'access', access: 'after_wait' },
            plus: { kind: 'access', access: 'immediate' },
            pro: { kind: 'access', access: 'immediate' },
          },
        },
        {
          id: 'contribution_capacity',
          placements: ['card', 'comparison'],
          values: {
            free: { kind: 'level', level: 'standard' },
            plus: { kind: 'level', level: 'more' },
            pro: { kind: 'level', level: 'most' },
          },
        },
      ],
    },
  ],
}

const PLANS: Record<string, MembershipPlanSku[]> = {
  plus: [sku('plus', 725)],
  pro: [sku('pro', 1450)],
}

function sku(plan: string, amount: number): MembershipPlanSku {
  return {
    id: `${plan}-monthly`,
    plan,
    price: { amount, currency: 'usd' },
    interval: 'monthly',
    stripe_price_id: `price_${plan}`,
  }
}

describe('PlanComparisonTable', () => {
  let t: Translator

  beforeAll(async () => {
    t = createTranslator('en', enMessages)
  })

  function renderTable() {
    return render(
      <PlanComparisonTable
        benefitCatalog={BENEFIT_CATALOG}
        locale='en-US'
        plans={PLANS}
        t={t}
      />,
      { wrapper: Wrapper },
    )
  }

  it('renders rows from the API benefit catalog', () => {
    renderTable()
    expect(screen.getByRole('button', { name: 'Publish public contributions' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Contribution capacity' })).toBeInTheDocument()
    expect(screen.getByText('After the new-member wait')).toBeInTheDocument()
    expect(screen.getAllByText('Immediately')).toHaveLength(2)
  })

  it('uses live SKU prices instead of hard-coded plan prices', () => {
    renderTable()
    expect(screen.getByText('$7.25')).toBeInTheDocument()
    expect(screen.getByText('$14.50')).toBeInTheDocument()
    expect(screen.queryByText('$5')).not.toBeInTheDocument()
  })

  it('does not render private vote weight or exact dynamic quotas', () => {
    renderTable()
    expect(
      screen.queryByText(/vote weight|50x|200x|contributions per day/i),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Standard')).toBeInTheDocument()
    expect(screen.getByText('More')).toBeInTheDocument()
    expect(screen.getByText('Most')).toBeInTheDocument()
  })

  it('omits a known benefit when a future value shape is not understood', () => {
    const catalog = structuredClone(BENEFIT_CATALOG)
    catalog.groups[0]!.benefits[0]!.values.free = {
      kind: 'access',
      access: 'future_access_mode',
    } as unknown as (typeof catalog.groups)[number]['benefits'][number]['values']['free']

    render(
      <PlanComparisonTable
        benefitCatalog={catalog}
        locale='en-US'
        plans={PLANS}
        t={t}
      />,
      { wrapper: Wrapper },
    )

    expect(
      screen.queryByRole('button', { name: 'Publish public contributions' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Contribution capacity' })).toBeInTheDocument()
  })

  it('renders the section heading', () => {
    renderTable()
    expect(screen.getByRole('heading', { name: 'Compare Plans' })).toBeInTheDocument()
  })

  it('renders all three plan columns', () => {
    renderTable()
    expect(screen.getByText('Free')).toBeInTheDocument()
    expect(screen.getByText('Plus')).toBeInTheDocument()
    expect(screen.getByText('Pro')).toBeInTheDocument()
  })

  it('renders tooltip row labels as buttons for keyboard access', () => {
    renderTable()

    expect(screen.getByRole('button', { name: 'Contribution capacity' })).toBeInTheDocument()
  })

  it('renders a table element', () => {
    const { container } = renderTable()
    expect(container.querySelector('table')).not.toBeNull()
  })

  it('uses th scope="row" for every feature row', () => {
    const { container } = renderTable()
    const rowHeaders = container.querySelectorAll('th[scope="row"]')
    const featureRows = [...container.querySelectorAll('tbody tr')].filter(
      row => row.querySelector('th[colspan]') === null,
    )
    expect(rowHeaders.length).toBe(featureRows.length)
    expect(rowHeaders.length).toBeGreaterThan(0)
  })

  it('renders the live catalog support row and page and source crawl history', () => {
    render(
      <PlanComparisonTable
        benefitCatalog={plansFixture.benefit_catalog as MembershipBenefitCatalog}
        locale='en-US'
        plans={PLANS}
        t={t}
      />,
      { wrapper: Wrapper },
    )

    expect(screen.getByRole('button', { name: 'Support service level' })).toBeInTheDocument()
    expect(screen.getByText('Priority')).toBeInTheDocument()
    expect(screen.getByText('Highest priority')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Page and source crawl history' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/faster|vote weight|1\/2\/3/i)).not.toBeInTheDocument()
  })
})
