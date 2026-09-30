/* oxlint-disable no-mistakes/playwright-consistent-attribute -- moved test support preserves existing Testing Library selectors */
import { render } from '@testing-library/react'
import type { MouseEventHandler, ReactNode } from 'react'
import { vi } from 'vitest'
import { AuthProvider } from '@/lib/auth/auth-provider'
import { toClientAuthUser } from '@/lib/auth/client-auth-user'
import type { PostsResponseBody } from '@/types/api-responses'
import type { Post } from '@/types/posts'
import type { User } from '@/types/user'

export type { PostElection } from '@/types/posts'

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
        onClick?: MouseEventHandler<HTMLAnchorElement>
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

vi.mock(
  import('@/components/shared/time-ago'),
  () =>
    ({
      TimeAgo: ({ date }: { date: string }) => <span>{date}</span>,
    }) as unknown as typeof import('@/components/shared/time-ago'),
)

vi.mock(
  import('next/dynamic'),
  () =>
    ({
      default: (fn: () => Promise<{ default: () => null }>) => {
        void fn()
        return () => null
      },
    }) as unknown as typeof import('next/dynamic'),
)

vi.mock(import('@/components/admin/admin-moderation-button'), () => ({
  default: () => <div data-testid='admin-moderation-button' />,
}))

vi.mock(import('@/components/shared/report-menu-item'), () => ({
  ReportMenuKebab: () => <div data-pw='report-menu-kebab' />,
}))

vi.mock(
  import('@/components/shared/markdown-content'),
  () =>
    ({
      MARKDOWN_CONTENT_FEATURES_RICH: { code: true, images: true, utm: true },
      MarkdownContent: ({ html }: { html: string }) => <div data-testid='markdown'>{html}</div>,
    }) as unknown as typeof import('@/components/shared/markdown-content'),
)

vi.mock(import('@/components/shared/user-avatar'), () => ({
  UserAvatar: ({ username }: { username: string }) => <span>{username}</span>,
}))

vi.mock(
  import('@/components/users/user-link'),
  () =>
    ({
      UserLink: ({
        children,
        tab,
        onClick,
      }: {
        children: ReactNode
        user: { id: string; username?: string | null }
        tab?: string
        onClick?: MouseEventHandler<HTMLAnchorElement>
      }) => (
        <a
          href={tab === 'comments' ? '/user/test/comments' : '/user/test'}
          onClick={onClick}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('@/components/users/user-link'),
)

vi.mock(import('@/lib/api/client/markdown'), () => ({
  previewMarkdown: vi.fn<VitestLooseMock>().mockResolvedValue({ html: '' }),
}))

vi.mock(import('@/lib/api/client/posts'), () => ({
  createPost: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/preferences/storage'), () => ({
  getPreference: vi.fn<VitestLooseMock>().mockReturnValue(undefined),
  setPreference: vi.fn<VitestLooseMock>(),
}))

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
        onValueChange: (value: string) => void
      }) => (
        // ast-grep-ignore: web-no-raw-form-elements -- test mock intentionally replaces the UI Select with native select semantics
        <select
          aria-label='Sort comments'
          value={value}
          onChange={event => onValueChange(event.target.value)}
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

export const makeComment = (
  id: string,
  parentId: string | null,
  username?: string,
  communityId?: string | null,
): Post => ({
  id,
  post_type: 'comment',
  title: '',
  slug: id,
  markdown: `Comment ${id}`,
  root_id: 'root-1',
  parent_id: parentId,
  created_by_id: 'user-1',
  created_by: username
    ? { __entity_type: 'user', id: 'user-1', username, profile_image_id: null }
    : undefined,
  created_at: `2024-01-0${id.slice(-1)}T00:00:00Z`,
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  deleted_by_id: null,
  archived_at: null,
  archived_by_id: null,
  broadcast: 'everyone',
  privacy: 'public',
  is_anonymous: false,
  community_id: communityId ?? null,
  clearance_status: 'approved',
})

export const makeData = (comments: Post[]): PostsResponseBody => ({
  results: comments.map(c => ({
    __entity_type: 'post',
    id: c.id,
    ranking: 0,
    search_vector_ts: null,
  })),
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  posts: Object.fromEntries(comments.map(c => [c.id, c])),
  posts_metrics: {},
  markdown_to_html: Object.fromEntries(comments.map(c => [c.id, `<p>Comment ${c.id}</p>`])),
})

export function renderWithAuth(ui: ReactNode, currentUser: User | null = null) {
  return render(
    <AuthProvider initialUser={currentUser ? toClientAuthUser(currentUser) : null}>
      {ui}
    </AuthProvider>,
  )
}
