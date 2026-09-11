import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock(import('@/lib/i18n/use-translations'), () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock(import('@/lib/api/client'), () => ({
  createHousehold: vi.fn<VitestLooseMock>(),
  getHouseholdsClient: vi.fn<VitestLooseMock>(),
  getHouseholdMembershipsClient: vi.fn<VitestLooseMock>(),
  removeHouseholdMembership: vi.fn<VitestLooseMock>(),
}))

import { HouseholdManager } from '../household-manager'
import type { HouseholdSection } from '@/types/my'
import { allByPw, makeMembership, makeSection } from '../test-helpers/household-manager'

const pageInfo = { has_next_page: false, start_cursor: null, end_cursor: null }

function renderManager(initialSections: HouseholdSection[]) {
  const owned = initialSections.find(section => section.isOwner) ?? null
  const shared = initialSections.filter(section => !section.isOwner)
  return render(
    <HouseholdManager
      initialOwnedSection={owned}
      initialSharedPage={{
        results: shared.map(section => ({ id: section.household.id, section })),
        page_info: pageInfo,
      }}
      ownedProbeSucceeded
      sharedLoadError={false}
    />,
  )
}

describe('HouseholdManager rendering', () => {
  it('renders zero, one, and multiple household states', () => {
    const { unmount } = renderManager([])
    expect(screen.getByRole('button', { name: 'Create household' })).toBeVisible()
    unmount()
    renderManager([makeSection()])
    expect(screen.getByRole('heading', { name: 'Your household' })).toBeVisible()
  })

  it('renders shared households read-only with stable ordinal labels', () => {
    renderManager([
      makeSection(),
      makeSection({
        household: { id: 'shared-1', owner_id: 'user-2', updated_at: '2026-07-01' },
        isOwner: false,
      }),
      makeSection({
        household: { id: 'shared-2', owner_id: 'user-3', updated_at: '2026-06-30' },
        isOwner: false,
      }),
    ])
    expect(screen.getByRole('heading', { name: 'Shared household 1' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Shared household 2' })).toBeVisible()
    expect(allByPw('household-read-only-copy')).toHaveLength(2)
  })

  it('uses usernames and never renders member UUIDs', () => {
    const uuid = '00000000-0000-7000-8000-000000000999'
    const { container } = renderManager([
      makeSection({
        memberships: [
          makeMembership(),
          makeMembership({
            id: 'membership-2',
            relationship: ' ',
            individual: {
              id: uuid,
              user_id: null,
              username: ' \n ',
              updated_at: '2026-07-01T00:00:00Z',
            },
          }),
        ],
      }),
    ])
    expect(screen.getByText('@alice')).toBeVisible()
    expect(screen.getByText('Household member')).toBeVisible()
    expect(container).not.toHaveTextContent(uuid)
  })
})
