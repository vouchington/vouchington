import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommunityApplicationQuestion } from '@/types/api-responses'
import {
  expectInputEnterSubmits,
  expectTextareaCmdEnterSubmits,
} from '@/test-helpers/form-keyboard'
import { ApplicationForm } from '../application-form'

const mockRouterPush = vi.fn<VitestLooseMock>()

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({
        push: mockRouterPush,
      }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/client'), () => ({
  applyToCommunity: vi.fn<VitestLooseMock>(),
}))

import { applyToCommunity } from '@/lib/api/client'

const mockApplyToCommunity = vi.mocked(applyToCommunity)

describe('ApplicationForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the submit button disabled after success while routing', async () => {
    mockApplyToCommunity.mockResolvedValue(undefined)

    render(
      <ApplicationForm
        communitySlug='test-community'
        questions={[]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Apply to Join' }))

    await waitFor(() => {
      expect(mockApplyToCommunity).toHaveBeenCalledWith('test-community', {}, undefined)
      expect(mockRouterPush).toHaveBeenCalledWith('/communities/test-community')
    })

    expect(screen.getByRole('button', { name: 'Submitting...' })).toBeDisabled()
  })

  it('renders message textarea when there are no questions', () => {
    render(
      <ApplicationForm
        communitySlug='test-community'
        questions={[]}
      />,
    )
    expect(screen.getByLabelText(/message/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/tell us why you want to join/i)).toBeInTheDocument()
  })

  it('renders message textarea alongside questions', () => {
    render(
      <ApplicationForm
        communitySlug='test-community'
        questions={
          [
            {
              id: 'q1',
              question: 'Why join?',
              field_type: 'short_text',
              required: false,
              options: null,
            },
          ] as unknown as import('@/types/api-responses').CommunityApplicationQuestion[]
        }
      />,
    )
    expect(screen.getByLabelText(/message/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/anything else/i)).toBeInTheDocument()
  })

  it('submits message with answers', async () => {
    mockApplyToCommunity.mockResolvedValue(undefined)

    render(
      <ApplicationForm
        communitySlug='test-community'
        questions={[]}
      />,
    )

    const textarea = screen.getByPlaceholderText(/tell us why you want to join/i)
    fireEvent.change(textarea, { target: { value: 'I want to learn' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply to Join' }))

    await waitFor(() => {
      expect(mockApplyToCommunity).toHaveBeenCalledWith('test-community', {}, 'I want to learn')
    })
  })

  it('submits when Enter is pressed in a short-text input', async () => {
    mockApplyToCommunity.mockResolvedValue(undefined)
    render(
      <ApplicationForm
        communitySlug='test-community'
        questions={
          [
            {
              id: 'q1',
              question: 'Why join?',
              field_type: 'short_text',
              required: true,
              options: null,
            },
          ] as unknown as CommunityApplicationQuestion[]
        }
      />,
    )
    const input = screen.getByLabelText(/why join/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'because' } })
    void expectInputEnterSubmits({ input, onSubmit: mockApplyToCommunity })
    await waitFor(() => {
      expect(mockApplyToCommunity).toHaveBeenCalledWith(
        'test-community',
        { q1: 'because' },
        undefined,
      )
    })
  })

  it('submits message typed in the "Anything else" textarea when questions are present', async () => {
    mockApplyToCommunity.mockResolvedValue(undefined)

    render(
      <ApplicationForm
        communitySlug='test-community'
        questions={
          [
            {
              id: 'q1',
              question: 'Why join?',
              field_type: 'short_text',
              required: false,
              options: null,
            },
          ] as unknown as CommunityApplicationQuestion[]
        }
      />,
    )

    const messageTextarea = screen.getByPlaceholderText(/anything else/i)
    fireEvent.change(messageTextarea, { target: { value: 'Extra context' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Application' }))

    await waitFor(() => {
      expect(mockApplyToCommunity).toHaveBeenCalledWith('test-community', {}, 'Extra context')
    })
  })

  it('Cmd+Enter and Ctrl+Enter submit from a long-text textarea; plain Enter does not', () => {
    render(
      <ApplicationForm
        communitySlug='test-community'
        questions={
          [
            {
              id: 'q1',
              question: 'Tell us more',
              field_type: 'long_text',
              required: false,
              options: null,
            },
          ] as unknown as CommunityApplicationQuestion[]
        }
      />,
    )
    const textarea = screen.getByLabelText(/tell us more/i) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'long answer' } })
    const onSubmit = vi.fn<VitestLooseMock>()
    textarea.form!.addEventListener('submit', onSubmit)
    expectTextareaCmdEnterSubmits({ textarea, onSubmit })
  })
})
