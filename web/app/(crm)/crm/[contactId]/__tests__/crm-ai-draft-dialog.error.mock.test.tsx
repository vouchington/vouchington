import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { CrmAiDraftDialog } from '../crm-ai-draft-dialog'
import { generateCrmEmailDraft } from '@/lib/api/client/crm'

vi.mock(import('@/lib/api/client/crm'), () => ({
  generateCrmEmailDraft: vi.fn<VitestLooseMock>(),
  sendCrmEmail: vi.fn<VitestLooseMock>(),
}))

const { toastMock } = vi.hoisted(() => {
  const mock = Object.assign(vi.fn<VitestLooseMock>(), {
    error: vi.fn<VitestLooseMock>(),
    success: vi.fn<VitestLooseMock>(),
  })
  return { toastMock: mock }
})

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: toastMock,
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/on-error'), () => ({
  default: (err: unknown, options: { fallback: string }) => {
    toastMock.error(options.fallback)
    return options.fallback
  },
  onSuccess: (message: string) => {
    toastMock.success(message)
  },
}))

const mockGenerate = vi.mocked(generateCrmEmailDraft)

describe('CrmAiDraftDialog error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports generate-draft failures via onError fallback', async () => {
    mockGenerate.mockRejectedValueOnce(new Error('Generate failed'))

    render(<CrmAiDraftDialog contactId='contact-1' />)
    fireEvent.click(screen.getByRole('button', { name: /AI Draft/i }))
    const textarea = (await screen.findByLabelText(
      'Instructions (optional)',
    )) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Focus on partnership' } })
    fireEvent.click(screen.getByRole('button', { name: /generate draft/i }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to generate draft')
    })
  })
})
