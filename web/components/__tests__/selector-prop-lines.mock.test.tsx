import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { WriteDialog } from '../navbar/write-dialog'
import { TopicAutocomplete } from '../posts/topic-autocomplete'
import { TagAutocomplete } from '../tags/tag-autocomplete'
import { UserAutocomplete } from '../users/user-autocomplete'
import { CommunityListAutocomplete } from '../communities/community-list-autocomplete'
import { FeedViewToggle } from '../feed/feed-view-toggle'
import { ActivityVisibilitySection, MessagingSection } from '../my/privacy-form/visibility-sections'
import { PostDefaultsSection } from '../my/privacy-form/post-defaults-section'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        prefetch: _prefetch,
        ...props
      }: {
        children: ReactNode
        href: string
        prefetch?: boolean
        [key: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(
  import('@/components/ui/button'),
  () =>
    ({
      Button: ({ children }: { children: ReactNode; [key: string]: unknown }) => (
        <div>{children}</div>
      ),
    }) as unknown as typeof import('@/components/ui/button'),
)

vi.mock(
  import('@/components/ui/dialog'),
  () =>
    ({
      Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      DialogTitle: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) => (
        <h2 {...props}>{children}</h2>
      ),
    }) as unknown as typeof import('@/components/ui/dialog'),
)

vi.mock(import('@/components/shared/entity-autocomplete'), () => ({
  EntityAutocomplete: ({ dataPw }: { dataPw?: { input?: string; item?: string } }) => (
    <div>
      <input
        aria-label='entity search'
        data-pw={dataPw?.input}
      />
      <div data-pw={dataPw?.item} />
    </div>
  ),
}))

vi.mock(import('@/components/my/audience-select'), () => ({
  AudienceSelect: ({
    dataPw,
  }: {
    dataPw?: { trigger?: string; options?: Record<string, string> }
  }) => (
    <div>
      <button
        type='button'
        aria-label='audience trigger'
        data-pw={dataPw?.trigger}
      />
      {Object.values(dataPw?.options ?? {}).map(value => (
        <div
          key={value}
          data-pw={value}
        />
      ))}
    </div>
  ),
}))

vi.mock(import('@/components/my/privacy-form/post-default-select'), () => ({
  PostDefaultSelect: ({
    dataPw,
  }: {
    dataPw?: { trigger?: string; options?: Record<string, string> }
  }) => (
    <div>
      <button
        type='button'
        aria-label='post default trigger'
        data-pw={dataPw?.trigger}
      />
      {Object.values(dataPw?.options ?? {}).map(value => (
        <div
          key={value}
          data-pw={value}
        />
      ))}
    </div>
  ),
}))

vi.mock(import('@/lib/preferences/use-feed-style'), () => ({
  useFeedStyle: () => ({ feedStyle: 'summary', setFeedStyle: vi.fn<VitestLooseMock>() }),
}))

vi.mock(import('@/components/shared/view-mode-dropdown'), () => ({
  ViewModeDropdown: ({ dataPw, options }: { dataPw?: string; options: { dataPw: string }[] }) => (
    <div>
      <button
        type='button'
        aria-label='view mode trigger'
        data-pw={dataPw}
      />
      {options.map(option => (
        <div
          key={option.dataPw}
          data-pw={option.dataPw}
        />
      ))}
    </div>
  ),
}))

const baseVisibilitySettings = {
  follows_visibility: 'everyone',
  topic_follows_visibility: 'everyone',
  rss_feed_follows_visibility: 'everyone',
  community_memberships_visibility: 'everyone',
  followers_visibility: 'everyone',
  likes_visibility: 'everyone',
  direct_messages_audience: 'everyone',
  cards_visibility: 'everyone',
  rewards_program_statuses_visibility: 'everyone',
  spending_categories_visibility: 'everyone',
  default_post_broadcast: 'everyone',
  default_post_privacy: 'public',
} as const

describe('selector prop coverage', () => {
  it('renders wrapper-level selector data-pw values', () => {
    const onChange = vi.fn<VitestLooseMock>()
    const { container } = render(
      <>
        <WriteDialog
          open
          onOpenChange={vi.fn<VitestLooseMock>()}
        />
        <TopicAutocomplete
          value={null}
          label=''
          onChange={vi.fn<VitestLooseMock>()}
        />
        <TagAutocomplete
          objectType='url'
          onSelect={vi.fn<VitestLooseMock>()}
        />
        <UserAutocomplete
          value={null}
          label=''
          dataPw={{
            input: 'user-autocomplete-input',
            item: 'user-autocomplete-item',
          }}
          onChange={vi.fn<VitestLooseMock>()}
        />
        <CommunityListAutocomplete
          itemType='url'
          onSelect={vi.fn<VitestLooseMock>()}
        />
        <FeedViewToggle />
        <ActivityVisibilitySection
          settings={baseVisibilitySettings}
          pending={new Set()}
          onChange={onChange}
        />
        <MessagingSection
          settings={baseVisibilitySettings}
          pending={new Set()}
          onChange={onChange}
        />
        <PostDefaultsSection
          settings={baseVisibilitySettings}
          pending={new Set()}
          onChange={onChange}
        />
      </>,
    )

    for (const testId of [
      'write-dialog-link-topic-recommendations-create',
      'topic-autocomplete-input',
      'tag-autocomplete-input-url',
      'user-autocomplete-input',
      'community-list-autocomplete-input-url',
      'feed-view-toggle-summary',
      'follows-visibility-select',
      'direct-messages-audience-option-mutual-followers',
      'default-post-broadcast-option-mutual-followers',
      'default-post-privacy-option-private',
    ]) {
      expect(container.querySelector(`[data-pw="${testId}"]`)).not.toBeNull()
    }
  })
})
