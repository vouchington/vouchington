/* oxlint-disable no-mistakes/playwright-consistent-attribute, no-mistakes/playwright-literals, no-mistakes/playwright-defaults -- moved test support forwards the component data-pw props the privacy tests query */
import type { ReactNode } from 'react'
import { vi } from 'vitest'
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
        children: ReactNode
        value: string
        onValueChange?: (next: string) => void
        disabled?: boolean
      }) => (
        // ast-grep-ignore: web-no-raw-form-elements -- test double replaces Select with a button the privacy tests click
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
        children: ReactNode
        'data-pw'?: string
      }) => (
        // ast-grep-ignore: web-no-raw-form-elements -- test double replaces SelectTrigger with a button the privacy tests query
        <button
          type='button'
          data-pw={dataPw}
        >
          {children}
        </button>
      ),
      SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
      SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectItem: ({
        children,
        value,
        'data-pw': dataPw,
      }: {
        children: ReactNode
        value: string
        'data-pw'?: string
      }) => (
        // ast-grep-ignore: web-no-raw-form-elements -- test double replaces SelectItem with an option the privacy tests query
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
      Label: ({ children }: { children: ReactNode }) => (
        // ast-grep-ignore: web-no-raw-form-elements -- test double replaces Label with a native label
        <label>{children}</label>
      ),
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

export { makeSettings }
