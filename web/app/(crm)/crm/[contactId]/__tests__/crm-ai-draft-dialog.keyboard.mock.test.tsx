import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, it, vi } from 'vitest'
import { expectTextareaCmdEnterSubmits } from '@/test-helpers/form-keyboard'
import { CrmAiDraftDialog } from '../crm-ai-draft-dialog'
import { generateCrmEmailDraft } from '@/lib/api/client/crm'

vi.mock(import('@/lib/api/client/crm'), () => ({
  generateCrmEmailDraft: vi.fn<VitestLooseMock>(),
  sendCrmEmail: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { success: vi.fn<VitestLooseMock>(), error: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('sonner'),
)

const mockGenerateCrmEmailDraft = vi.mocked(generateCrmEmailDraft)

describe('CrmAiDraftDialog — keyboard submit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerateCrmEmailDraft.mockResolvedValue({
      draft: {
        subject: 'Subject',
        body_text: 'Body',
      },
    } as Awaited<ReturnType<typeof generateCrmEmailDraft>>)
  })

  it('Cmd+Enter and Ctrl+Enter on the prompt textarea submit; plain Enter does not', async () => {
    render(<CrmAiDraftDialog contactId='contact-1' />)

    fireEvent.click(screen.getByRole('button', { name: /AI Draft/i }))

    const textarea = (await screen.findByLabelText(
      'Instructions (optional)',
    )) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Focus on partnership' } })

    // Spy on the native submit event because the form's React onSubmit short-circuits
    // re-entry (saving state) between the three keydowns.
    const onSubmit = vi.fn<VitestLooseMock>()
    textarea.form!.addEventListener('submit', onSubmit)
    expectTextareaCmdEnterSubmits({ textarea, onSubmit })
  })
})
