/* oxlint-disable no-mistakes/playwright-consistent-attribute -- moved test support preserves existing Testing Library selectors */
import type { MouseEventHandler, ReactNode } from 'react'
import { vi } from 'vitest'
import { createUserPathname } from '@/lib/links/entity-href'

const scoreVoteProps = vi.hoisted(() => [] as Array<{ existingVoteChoice?: string }>)

const nextDynamicMock = vi.hoisted(() => {
  require('react')
  return {
    default: (fn: () => Promise<{ default: () => null }>) => {
      void fn()
      // oxlint-disable-next-line react/only-export-components -- next/dynamic test double, never fast-refreshed
      return function MockDynamic() {
        return null
      }
    },
  }
})

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        className,
        onClick,
      }: {
        children: ReactNode
        href: string
        className?: string
        onClick?: MouseEventHandler<HTMLElement>
      }) => (
        <a
          href={href}
          className={className}
          onClick={onClick}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(import('next/dynamic'), () => nextDynamicMock as unknown as typeof import('next/dynamic'))

vi.mock(
  import('@/components/admin/admin-moderation-button'),
  () =>
    ({
      default: () => <div data-testid='admin-moderation-button' />,
    }) as unknown as typeof import('@/components/admin/admin-moderation-button'),
)

vi.mock(
  import('@/components/shared/report-menu-item'),
  () =>
    ({
      ReportMenuKebab: () => <div data-pw='report-menu-kebab' />,
    }) as unknown as typeof import('@/components/shared/report-menu-item'),
)

vi.mock(
  import('@/components/shared/time-ago'),
  () =>
    ({
      TimeAgo: ({ date }: { date: string }) => <span>{date}</span>,
    }) as unknown as typeof import('@/components/shared/time-ago'),
)

vi.mock(
  import('@/components/shared/agent-badge'),
  () =>
    ({
      AgentBadge: () => <span>Agent</span>,
    }) as unknown as typeof import('@/components/shared/agent-badge'),
)

vi.mock(
  import('@/components/shared/markdown-content'),
  () =>
    ({
      MARKDOWN_CONTENT_FEATURES_RICH: { code: true, images: true, utm: true },
      MarkdownContent: ({ html }: { html: string }) => <div data-testid='markdown'>{html}</div>,
    }) as unknown as typeof import('@/components/shared/markdown-content'),
)

vi.mock(
  import('@/components/shared/user-avatar'),
  () =>
    ({
      UserAvatar: ({ username }: { username: string }) => (
        <span data-testid='avatar'>{username}</span>
      ),
    }) as unknown as typeof import('@/components/shared/user-avatar'),
)

vi.mock(
  import('@/components/users/user-link'),
  () =>
    ({
      UserLink: ({
        children,
        user,
        tab,
        className,
        onClick,
      }: {
        children: ReactNode
        user: { id: string; username?: string | null }
        tab?: string
        className?: string
        onClick?: MouseEventHandler<HTMLElement>
      }) => (
        <a
          data-testid='user-link'
          href={createUserPathname(user, tab ? `/${tab}` : '')}
          className={className}
          onClick={onClick}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('@/components/users/user-link'),
)

vi.mock(
  import('@/components/votes/score-vote'),
  () =>
    ({
      ScoreVote: (props: { existingVoteChoice?: string }) => {
        scoreVoteProps.push(props)
        return <div data-testid='score-vote'>votes</div>
      },
    }) as unknown as typeof import('@/components/votes/score-vote'),
)

vi.mock(import('@/lib/api/client/elections'), () => ({
  submitPostVote: vi.fn<VitestLooseMock>(),
  clearPostVote: vi.fn<VitestLooseMock>(),
}))

export { scoreVoteProps }
