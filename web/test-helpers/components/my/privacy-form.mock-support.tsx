/* oxlint-disable no-mistakes/playwright-consistent-attribute, no-mistakes/playwright-literals, no-mistakes/playwright-defaults -- moved test support forwards the component data-pw props the privacy tests query */
import type { ReactNode } from 'react'
import { vi } from 'vitest'
import type { UserPrivacyAudience } from '@/types/user'

vi.mock(import('@/components/ui/select'), async () => {
  const { Button } = await import('@/components/ui/button')
  return {
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
      <Button
        type='button'
        data-testid='select'
        data-value={value}
        onClick={() => onValueChange?.('followers')}
      >
        {children}
      </Button>
    ),
    SelectTrigger: ({
      children,
      'data-pw': dataPw,
    }: {
      children: ReactNode
      'data-pw'?: string
    }) => (
      <Button
        type='button'
        data-pw={dataPw}
      >
        {children}
      </Button>
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
      <option
        value={value}
        data-pw={dataPw}
      >
        {children}
      </option>
    ),
  } as unknown as typeof import('@/components/ui/select')
})

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
