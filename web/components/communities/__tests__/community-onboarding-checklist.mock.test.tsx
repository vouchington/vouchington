import { mockLucideReact } from '@/test-helpers/lucide-icons'
import { configure, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

configure({ testIdAttribute: 'data-pw' })

const { mockGetPreference, mockSetPreference } = vi.hoisted(() => ({
  mockGetPreference: vi.fn<VitestLooseMock>(),
  mockSetPreference: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/preferences/storage'), () => ({
  getPreference: mockGetPreference,
  setPreference: mockSetPreference,
}))

vi.mock(
  import('@/components/ui/card'),
  () =>
    ({
      Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
      CardContent: ({ children }: any) => <div>{children}</div>,
      CardHeader: ({ children }: any) => <div>{children}</div>,
      CardTitle: ({ children }: any) => <div>{children}</div>,
      CardDescription: ({ children }: any) => <div>{children}</div>,
    }) as unknown as typeof import('@/components/ui/card'),
)

vi.mock(
  import('@/components/ui/button'),
  () =>
    ({
      Button: ({ children, onClick, disabled, ...props }: any) => (
        <button
          type='button'
          onClick={onClick}
          disabled={disabled}
          {...props}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/button'),
)

vi.mock(import('lucide-react'), () =>
  mockLucideReact({
    CheckCircle2: () => null,
    Circle: () => null,
  }),
)

import { CommunityOnboardingChecklist } from '../community-onboarding-checklist'

describe('CommunityOnboardingChecklist', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetPreference.mockReturnValue('')
  })

  it('renders the checklist card when getPreference returns empty string', () => {
    render(
      <CommunityOnboardingChecklist
        communitySlug='credit-cards'
        hasRules={false}
        automodConfigured={false}
      />,
    )
    expect(screen.getByTestId('community-onboarding-checklist')).toBeInTheDocument()
  })

  it('returns null when getPreference returns dismissed', () => {
    mockGetPreference.mockReturnValue('dismissed')
    const { container } = render(
      <CommunityOnboardingChecklist
        communitySlug='credit-cards'
        hasRules={false}
        automodConfigured={false}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('clicking dismiss calls setPreference with dismissed and hides the card', () => {
    render(
      <CommunityOnboardingChecklist
        communitySlug='credit-cards'
        hasRules={false}
        automodConfigured={false}
      />,
    )

    fireEvent.click(screen.getByTestId('community-onboarding-dismiss'))

    expect(mockSetPreference).toHaveBeenCalledWith(
      'community-mod-onboarding:credit-cards',
      'dismissed',
    )
    expect(screen.queryByTestId('community-onboarding-checklist')).not.toBeInTheDocument()
  })

  it('clicking orientation ack calls setPreference with a value containing orientation', () => {
    render(
      <CommunityOnboardingChecklist
        communitySlug='credit-cards'
        hasRules={false}
        automodConfigured={false}
      />,
    )

    fireEvent.click(screen.getByTestId('onboarding-item-orientation-ack'))

    expect(mockSetPreference).toHaveBeenCalledWith(
      'community-mod-onboarding:credit-cards',
      expect.stringContaining('orientation'),
    )
  })
})
