import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetPlans, mockGetMembership, mockGetCurrentUser, mockPlanCards } = vi.hoisted(() => ({
  mockGetPlans: vi.fn<VitestLooseMock>(),
  mockGetMembership: vi.fn<VitestLooseMock>(),
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockPlanCards: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getPlans: mockGetPlans,
  getMembership: mockGetMembership,
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock(import('@/lib/i18n/get-resolved-ui-locale'), () => ({
  getResolvedUiLocale: vi.fn<VitestLooseMock>().mockResolvedValue('en-US'),
}))

vi.mock(import('next/headers'), () => ({
  headers: vi.fn<VitestLooseMock>().mockResolvedValue(new Headers()),
}))

vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock(import('@/components/asides/about-voucha-aside'), () => ({
  AboutVouchaAside: () => <aside>about voucha</aside>,
}))

vi.mock(import('@/components/memberships/plan-cards'), () => ({
  PlanCards: mockPlanCards,
}))

vi.mock(import('@/components/memberships/plan-comparison-table'), () => ({
  PlanComparisonTable: () => <div data-testid='plan-comparison-table' />,
}))

vi.mock(import('@/components/memberships/plan-faq'), () => ({
  PlanFAQ: () => <div data-testid='plan-faq' />,
}))

import PlansPage from './page'

describe('PlansPage', () => {
  beforeEach(() => {
    mockGetPlans.mockReset()
    mockGetPlans.mockResolvedValue({ plans: {}, benefit_catalog: { version: 1, groups: [] } })
    mockGetMembership.mockReset()
    mockGetMembership.mockResolvedValue({ membership: null })
    mockGetCurrentUser.mockReset()
    mockGetCurrentUser.mockResolvedValue(null)
    mockPlanCards.mockReset()
    mockPlanCards.mockReturnValue(<div data-testid='plan-cards' />)
  })

  it('does not render breadcrumbs or breadcrumb structured data', async () => {
    const ui = await PlansPage()
    const { container } = render(ui)

    expect(screen.getByRole('heading', { name: 'Plans' })).toBeInTheDocument()
    expect(
      screen.getByText(/Any signed-in account with a username can create communities/),
    ).toBeInTheDocument()
    expect(screen.getByTestId('plan-cards')).toBeInTheDocument()
    expect(screen.getByTestId('plan-comparison-table')).toBeInTheDocument()
    expect(screen.getByTestId('plan-faq')).toBeInTheDocument()
    expect(container.querySelector('nav[aria-label="breadcrumb"]')).toBeNull()
    expect(container.querySelector('script[type="application/ld+json"]')).toBeNull()
  })

  it('passes signed-out membership state to plan cards', async () => {
    const ui = await PlansPage()
    render(ui)

    expect(mockGetMembership).not.toHaveBeenCalled()
    expect(mockPlanCards).toHaveBeenCalledWith(
      expect.objectContaining({ membership: undefined }),
      undefined,
    )
  })

  it('passes null membership for signed-in users without a subscription', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' })

    const ui = await PlansPage()
    render(ui)

    expect(mockGetMembership).toHaveBeenCalled()
    expect(mockPlanCards).toHaveBeenCalledWith(
      expect.objectContaining({ membership: null }),
      undefined,
    )
  })

  it('falls back to null membership for signed-in users when membership fetch fails', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' })
    mockGetMembership.mockRejectedValue(new Error('membership unavailable'))

    const ui = await PlansPage()
    render(ui)

    expect(mockPlanCards).toHaveBeenCalledWith(
      expect.objectContaining({ membership: null }),
      undefined,
    )
  })

  it('keeps plan benefits visible when an older API response omits the catalog', async () => {
    mockGetPlans.mockResolvedValue({ plans: {} })

    const ui = await PlansPage()
    render(ui)

    expect(mockPlanCards).toHaveBeenCalledWith(
      expect.objectContaining({
        benefitCatalog: expect.objectContaining({
          groups: expect.arrayContaining([expect.anything()]),
        }),
      }),
      undefined,
    )
  })
})
