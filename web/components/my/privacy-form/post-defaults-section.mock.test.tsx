import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PostDefaultsSection } from './post-defaults-section'
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

describe('PostDefaultsSection', () => {
  it('renders the Post Defaults heading', () => {
    render(
      <PostDefaultsSection
        pending={new Set()}
        settings={makeSettings()}
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Post Defaults' })).toBeInTheDocument()
  })

  it('renders the default_post_broadcast label', () => {
    const { container } = render(
      <PostDefaultsSection
        pending={new Set()}
        settings={makeSettings()}
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )

    expect(screen.getByText(/default post audience/i)).toBeInTheDocument()
    expect(container.querySelector('[data-pw="default-post-broadcast-select"]')).not.toBeNull()
    expect(
      container.querySelector('[data-pw="default-post-broadcast-option-mutual-followers"]'),
    ).not.toBeNull()
    expect(container.querySelector('[data-pw="default-post-privacy-select"]')).not.toBeNull()
    expect(
      container.querySelector('[data-pw="default-post-privacy-option-private"]'),
    ).not.toBeNull()
  })
})
