import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MembershipsAdminPage from '../memberships-admin-client'
import { grantMembership, fetchPlans } from '@/lib/api/client/memberships'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import { seedMessages } from '@/lib/i18n/use-translations'
import { esMessages } from '@ts-shared/ui-messages/locale-catalogs'

vi.mock(import('@/lib/api/client/memberships'), () => ({
  grantMembership: vi.fn<VitestLooseMock>(),
  fetchPlans: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/navigation/use-resolved-breadcrumbs'), () => ({
  useResolvedBreadcrumbs: vi.fn<VitestLooseMock>().mockReturnValue([]),
}))

vi.mock(
  import('@/components/users/user-autocomplete'),
  () =>
    ({
      UserAutocomplete: ({
        label: _label,
        value,
        onChange,
      }: {
        label: string
        value: string | null
        onChange: (id: string) => void
      }) => (
        <input
          aria-label='Search users'
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
        />
      ),
    }) as unknown as typeof import('@/components/users/user-autocomplete'),
)

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        children,
        onValueChange,
        value,
        disabled,
      }: {
        children: ReactNode
        onValueChange?: (value: string) => void
        value?: string
        disabled?: boolean
      }) => (
        <select
          disabled={disabled}
          onChange={event => onValueChange?.(event.target.value)}
          value={value}
        >
          {children}
        </select>
      ),
      SelectContent: ({ children }: { children: ReactNode }) => children,
      SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
        <option value={value}>{children}</option>
      ),
      SelectTrigger: ({ children }: { children: ReactNode }) => children,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => null,
}))

const mockFetchPlans = vi.mocked(fetchPlans)
const mockGrantMembership = vi.mocked(grantMembership)

describe('MembershipsAdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchPlans.mockResolvedValue({
      products: [
        {
          id: 'sku-plus-monthly',
          plan: 'plus',
          interval: 'monthly',
          providers: [
            {
              provider: 'stripe',
              environment: 'test',
              application_id: 'voucha-web',
              product_id: 'price_plus',
              base_plan_id: null,
              offer_id: null,
              sku_id: null,
              price: { amount: 999, currency: 'usd' },
            },
          ],
        },
      ],
      benefit_catalog: { version: 1, groups: [] },
    })
    mockGrantMembership.mockResolvedValue({
      membership: { id: 'membership-id' },
      grant: { id: 'grant-id' },
      queued: false,
    })
  })

  it('renders the heading and user search input', () => {
    render(<MembershipsAdminPage />)
    expect(screen.getByRole('heading', { name: /memberships admin/i })).toBeDefined()
    expect(screen.getByLabelText('Search users')).toBeDefined()
    expect(screen.getByRole('button', { name: /grant/i })).toBeDefined()
  })

  it('selecting a user updates userId state', () => {
    render(<MembershipsAdminPage />)
    const userInput = screen.getByLabelText('Search users') as HTMLInputElement
    fireEvent.change(userInput, { target: { value: 'user-123' } })
    expect(userInput.value).toBe('user-123')
  })

  it('selecting a plan fetches SKUs and shows them in the SKU select', async () => {
    render(<MembershipsAdminPage />)
    const [planSelect] = screen.getAllByRole('combobox')
    fireEvent.change(planSelect!, { target: { value: 'plus' } })
    await waitFor(() => {
      expect(mockFetchPlans).toHaveBeenCalledOnce()
    })
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /sku-plus-monthly/i })).toBeDefined()
    })
  })

  it('formats SKU prices with the active UI locale', async () => {
    seedMessages('es', esMessages)
    render(
      <UiLocaleProvider uiLocale='es'>
        <MembershipsAdminPage />
      </UiLocaleProvider>,
    )

    const [planSelect] = screen.getAllByRole('combobox')
    fireEvent.change(planSelect!, { target: { value: 'plus' } })

    expect(await screen.findByRole('option', { name: /9,99.*US\$/ })).toBeDefined()
    expect(screen.queryByRole('option', { name: /\$9\.99/ })).toBeNull()
  })

  it('shows error when fetchPlans fails', async () => {
    mockFetchPlans.mockRejectedValueOnce(new Error('Network error'))
    render(<MembershipsAdminPage />)
    const [planSelect] = screen.getAllByRole('combobox')
    fireEvent.change(planSelect!, { target: { value: 'plus' } })
    await waitFor(() => {
      expect(screen.getByText(/failed to load sku/i)).toBeDefined()
    })
  })

  it('grants membership with selected user/plan/sku and resets form on success', async () => {
    render(<MembershipsAdminPage />)
    // Select user
    fireEvent.change(screen.getByLabelText('Search users'), { target: { value: 'user-abc' } })
    // Select plan → triggers fetchPlans
    const [planSelect, skuSelect] = screen.getAllByRole('combobox')
    fireEvent.change(planSelect!, { target: { value: 'plus' } })
    await waitFor(() => expect(mockFetchPlans).toHaveBeenCalled())
    // Wait for SKU option and select it
    await waitFor(() =>
      expect(screen.queryByRole('option', { name: /sku-plus-monthly/i })).not.toBeNull(),
    )
    fireEvent.change(skuSelect!, { target: { value: 'sku-plus-monthly' } })
    fireEvent.change(screen.getByLabelText(/duration \(days\)/i), { target: { value: '30' } })
    // Grant
    fireEvent.click(screen.getByRole('button', { name: /grant/i }))
    await waitFor(() => {
      expect(mockGrantMembership).toHaveBeenCalledWith('user-abc', 'plus', 'sku-plus-monthly', 30)
    })
    await waitFor(() => {
      expect(screen.getByText(/granted successfully/i)).toBeDefined()
    })
    // User input should be reset
    expect((screen.getByLabelText('Search users') as unknown as HTMLInputElement).value).toBe('')
  })

  it('shows a pending confirmation when the grant is queued', async () => {
    mockGrantMembership.mockResolvedValueOnce({
      membership: null,
      grant: { id: 'grant-id' },
      queued: true,
    })
    render(<MembershipsAdminPage />)
    fireEvent.change(screen.getByLabelText('Search users'), { target: { value: 'user-abc' } })
    const [planSelect, skuSelect] = screen.getAllByRole('combobox')
    fireEvent.change(planSelect!, { target: { value: 'plus' } })
    await waitFor(() => expect(mockFetchPlans).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.queryByRole('option', { name: /sku-plus-monthly/i })).not.toBeNull(),
    )
    fireEvent.change(skuSelect!, { target: { value: 'sku-plus-monthly' } })
    fireEvent.change(screen.getByLabelText(/duration \(days\)/i), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: /grant/i }))

    await waitFor(() => {
      expect(
        screen.getByText(/grant queued.*activate when the current membership ends/i),
      ).toBeDefined()
    })
    expect(screen.queryByText(/granted successfully/i)).toBeNull()
  })
})
