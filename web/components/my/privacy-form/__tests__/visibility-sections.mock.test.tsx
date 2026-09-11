import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  MessagingSection,
  ActivityVisibilitySection,
  ProfileVisibilitySection,
} from '../visibility-sections'
import type { UserPrivacyAudience } from '@/types/user'

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        children,
        value,
        onValueChange,
      }: {
        children: React.ReactNode
        value: string
        onValueChange?: (v: string) => void
        disabled?: boolean
      }) => (
        <button
          type='button'
          data-testid='select'
          data-value={value}
          onClick={() => onValueChange?.('followers')}
        >
          {children}
        </button>
      ),
      SelectTrigger: ({
        children,
        'data-pw': dataPw,
      }: {
        children: React.ReactNode
        'data-pw'?: string
      }) => (
        <button
          type='button'
          data-pw={dataPw}
        >
          {children}
        </button>
      ),
      SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
      SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      SelectItem: ({
        children,
        value,
        'data-pw': dataPw,
      }: {
        children: React.ReactNode
        value: string
        'data-pw'?: string
      }) => (
        <option
          value={value}
          data-pw={dataPw}
        >
          {children}
        </option>
      ),
    }) as unknown as typeof import('@/components/ui/select'),
)

vi.mock(
  import('@/components/ui/label'),
  () =>
    ({
      Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
    }) as unknown as typeof import('@/components/ui/label'),
)

function makeSettings(overrides?: Partial<Record<string, string>>) {
  return {
    cards_visibility: 'everyone' as UserPrivacyAudience,
    rewards_program_statuses_visibility: 'everyone' as UserPrivacyAudience,
    spending_categories_visibility: 'everyone' as UserPrivacyAudience,
    follows_visibility: 'everyone' as UserPrivacyAudience,
    topic_follows_visibility: 'everyone' as UserPrivacyAudience,
    rss_feed_follows_visibility: 'everyone' as UserPrivacyAudience,
    community_memberships_visibility: 'everyone' as UserPrivacyAudience,
    followers_visibility: 'everyone' as UserPrivacyAudience,
    likes_visibility: 'everyone' as UserPrivacyAudience,
    direct_messages_audience: 'everyone' as UserPrivacyAudience,
    default_post_broadcast: 'everyone',
    default_post_privacy: 'public',
    ...overrides,
  }
}

describe('MessagingSection', () => {
  it('renders the direct-messages-audience-select', () => {
    const { container } = render(
      <MessagingSection
        pending={new Set()}
        settings={makeSettings()}
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )

    expect(screen.getByText(/who can send you direct messages/i)).toBeInTheDocument()
    expect(container.querySelector('[data-pw="direct-messages-audience-select"]')).not.toBeNull()
    expect(
      container.querySelector('[data-pw="direct-messages-audience-option-nobody"]'),
    ).not.toBeNull()
    expect(
      container.querySelector('[data-pw="direct-messages-audience-option-mutual-followers"]'),
    ).not.toBeNull()
  })

  it('renders the Messaging heading', () => {
    render(
      <MessagingSection
        pending={new Set()}
        settings={makeSettings()}
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Messaging' })).toBeInTheDocument()
  })

  it('renders the explanatory paragraph text', () => {
    render(
      <MessagingSection
        pending={new Set()}
        settings={makeSettings()}
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )

    expect(
      screen.getByText(/control who can start a direct message conversation with you/i),
    ).toBeInTheDocument()
  })

  it('calls onChange with direct_messages_audience when select fires', () => {
    const onChange = vi.fn<VitestLooseMock>()
    const { container } = render(
      <MessagingSection
        pending={new Set()}
        settings={makeSettings()}
        onChange={onChange}
      />,
    )

    fireEvent.click(container.querySelector('[data-testid="select"]')!)

    expect(onChange).toHaveBeenCalledWith('direct_messages_audience', 'followers')
  })
})

describe('ActivityVisibilitySection', () => {
  it('renders the Activity Visibility heading', () => {
    render(
      <ActivityVisibilitySection
        pending={new Set()}
        settings={makeSettings()}
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Activity Visibility' })).toBeInTheDocument()
  })

  it('renders the follows_visibility select label', () => {
    const { container } = render(
      <ActivityVisibilitySection
        pending={new Set()}
        settings={makeSettings()}
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )

    expect(screen.getByText(/who can see your followed users/i)).toBeInTheDocument()
    expect(container.querySelector('[data-pw="follows-visibility-select"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="follows-visibility-option-users"]')).not.toBeNull()
    expect(
      container.querySelector('[data-pw="follows-visibility-option-mutual-followers"]'),
    ).not.toBeNull()
  })
})

describe('ProfileVisibilitySection', () => {
  it('renders the Profile Visibility heading', () => {
    render(
      <ProfileVisibilitySection
        pending={new Set()}
        settings={makeSettings()}
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Profile Visibility' })).toBeInTheDocument()
  })

  it('renders the cards_visibility select label', () => {
    render(
      <ProfileVisibilitySection
        pending={new Set()}
        settings={makeSettings()}
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )

    expect(screen.getByText(/who can see your cards/i)).toBeInTheDocument()
  })
})
