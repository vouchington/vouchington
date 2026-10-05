import type { ChangeEventHandler, ReactNode } from 'react'
import { vi } from 'vitest'
import type { ModmailMessage, ModmailThread } from '@/lib/api/client/modmail'

const {
  mockGetModmailMessagesClient,
  mockSendModmailMessage,
  mockResolveModmailThread,
  mockOnError,
} = vi.hoisted(() => ({
  mockGetModmailMessagesClient: vi.fn<VitestLooseMock>(),
  mockSendModmailMessage: vi.fn<VitestLooseMock>(),
  mockResolveModmailThread: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/modmail'), () => ({
  getModmailMessagesClient: mockGetModmailMessagesClient,
  sendModmailMessage: mockSendModmailMessage,
  resolveModmailThread: mockResolveModmailThread,
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
}))

vi.mock(
  import('@/components/ui/badge'),
  () =>
    ({
      Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
    }) as unknown as typeof import('@/components/ui/badge'),
)

vi.mock(
  import('@/components/ui/button'),
  () =>
    ({
      Button: ({
        children,
        onClick,
        disabled,
        type: _type,
        loading: _loading,
        ...rest
      }: {
        children: ReactNode
        onClick?: () => void
        disabled?: boolean
        type?: 'button' | 'reset' | 'submit'
        loading?: boolean
        [k: string]: unknown
      }) => (
        // ast-grep-ignore: web-no-raw-form-elements -- test double replaces Button with a native button the modmail tests click
        <button
          type='button'
          onClick={onClick}
          disabled={disabled}
          {...rest}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/button'),
)

vi.mock(
  import('@/components/ui/textarea'),
  () =>
    ({
      Textarea: ({
        value,
        onChange,
        disabled,
        ...rest
      }: {
        value?: string
        onChange?: ChangeEventHandler<HTMLTextAreaElement>
        disabled?: boolean
        [k: string]: unknown
      }) => (
        // ast-grep-ignore: web-no-raw-form-elements -- test double replaces Textarea with a native textarea the modmail tests fill
        <textarea
          value={value}
          onChange={onChange}
          disabled={disabled}
          {...rest}
        />
      ),
    }) as unknown as typeof import('@/components/ui/textarea'),
)

vi.mock(import('@/components/shared/time-ago'), () => ({
  TimeAgo: () => <time>now</time>,
}))

function makeThread(overrides: Partial<ModmailThread> = {}): ModmailThread {
  return {
    id: 'thread-1',
    channel_type: 'modmail',
    title: 'Thread subject',
    community_id: 'c1',
    subject_user_id: 'user-subject',
    assigned_moderator_user_id: null,
    assigned_at: null,
    resolved_at: null,
    resolved_by_id: null,
    created_by_id: 'user-subject',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeMessage(id: string): ModmailMessage {
  return {
    id,
    conversation_id: 'thread-1',
    body_text: `Message ${id}`,
    created_by_id: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
  }
}

export {
  makeMessage,
  makeThread,
  mockGetModmailMessagesClient,
  mockOnError,
  mockResolveModmailThread,
  mockSendModmailMessage,
}
