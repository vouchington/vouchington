import { beforeAll, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createTranslator, type Translator } from '@ts-shared/ui-messages'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { MembershipBenefitCatalog } from '@/types/api-responses'
import plansFixture from '../../../api-fixtures/v1/responses/native.memberships.plans.default.json'
import { presentCardFeatures } from './plan-benefit-presentation'
import { PlanFeatureList } from './plan-feature-list'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'

describe('PlanFeatureList', () => {
  let t: Translator

  beforeAll(() => {
    t = createTranslator('en', enMessages)
  })

  it('renders unavailable catalog values with an X icon', () => {
    const catalog = plansFixture.benefit_catalog as MembershipBenefitCatalog
    const features = presentCardFeatures(catalog, 'free', t)

    render(
      <TooltipProvider>
        <PlanFeatureList features={features} />
      </TooltipProvider>,
    )

    for (const name of [
      'Post downvote counts: Not included',
      'Automatic post topics: None',
      'AI moderation rules: None',
    ]) {
      const button = screen.getByRole('button', { name })
      expect(button.closest('li')?.querySelector('.lucide-x')).not.toBeNull()
    }
  })

  it('omits a card benefit when its selected plan value is not understood', () => {
    const catalog = structuredClone(plansFixture.benefit_catalog) as MembershipBenefitCatalog
    const benefit = catalog.groups
      .flatMap(group => group.benefits)
      .find(({ id }) => id === 'public_contribution_access')!
    benefit.values.free = { kind: 'future_value' } as never

    render(
      <TooltipProvider>
        <PlanFeatureList features={presentCardFeatures(catalog, 'free', t)} />
      </TooltipProvider>,
    )

    expect(
      screen.queryByRole('button', { name: /Publish public contributions/ }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Contribution capacity/ })).toBeInTheDocument()
  })
})
