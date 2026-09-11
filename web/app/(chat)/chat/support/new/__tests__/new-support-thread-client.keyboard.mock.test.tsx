import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  expectInputEnterSubmits,
  expectTextareaCmdEnterSubmits,
} from '@/test-helpers/form-keyboard'
import { NewSupportThreadClient } from '../new-support-thread-client'

const mockRouterPush = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockOnError = vi.hoisted(() => vi.fn<VitestLooseMock>())

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
        [k: string]: unknown
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
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ push: mockRouterPush }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/client/support'), () => ({
  createMySupportThread: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
}))

import { createMySupportThread } from '@/lib/api/client/support'

const mockCreateMySupportThread = vi.mocked(createMySupportThread)

describe('NewSupportThreadClient — keyboard submit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOnError.mockReturnValue('Failed to submit request')
    mockCreateMySupportThread.mockResolvedValue({
      thread: { id: 'thread-1' },
    } as Awaited<ReturnType<typeof createMySupportThread>>)
  })

  it('Enter on the subject input submits the form via the API client', async () => {
    render(<NewSupportThreadClient conversationId={undefined} />)

    const subjectInput = screen.getByLabelText('Subject') as HTMLInputElement
    fireEvent.change(subjectInput, { target: { value: 'Need help with billing' } })

    void expectInputEnterSubmits({ input: subjectInput, onSubmit: mockCreateMySupportThread })

    await waitFor(() => {
      expect(mockCreateMySupportThread).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Need help with billing' }),
      )
    })
  })

  it('Cmd+Enter and Ctrl+Enter on the message textarea submit; plain Enter does not', () => {
    render(<NewSupportThreadClient conversationId={undefined} />)

    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Subject' } })
    const textarea = screen.getByLabelText('Message (optional)') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'More detail' } })

    // Spy on the native submit event because the form's React onSubmit short-circuits
    // re-entry (saving state) between the three keydowns.
    const onSubmit = vi.fn<VitestLooseMock>()
    textarea.form!.addEventListener('submit', onSubmit)
    expectTextareaCmdEnterSubmits({ textarea, onSubmit })
  })

  it('reports failed support requests through onError', async () => {
    mockCreateMySupportThread.mockRejectedValueOnce(new Error('network'))
    render(<NewSupportThreadClient conversationId='01960000-0000-7000-8000-000000000001' />)

    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Need help' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Request' }))

    expect(await screen.findByText('Failed to submit request')).toBeInTheDocument()
    expect(mockOnError).toHaveBeenCalledWith(expect.any(Error), {
      fallback: 'Failed to submit request',
      tags: { form: 'support-thread-new' },
    })
  })
})
