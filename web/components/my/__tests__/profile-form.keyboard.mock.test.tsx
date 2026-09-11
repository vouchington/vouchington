import { describe, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { expectTextareaCmdEnterSubmits } from '@/test-helpers/form-keyboard'
import { ProfileForm } from '../profile-form'

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: {
        success: vi.fn<VitestLooseMock>(),
        error: vi.fn<VitestLooseMock>(),
        info: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/api/client'), () => ({
  updateMyProfile: vi.fn<VitestLooseMock>(),
}))

import { updateMyProfile } from '@/lib/api/client'

const mockUpdateMyProfile = vi.mocked(updateMyProfile)

describe('ProfileForm keyboard submit', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockUpdateMyProfile.mockResolvedValue(undefined as never)
  })

  it('Cmd+Enter and Ctrl+Enter in the textarea call updateMyProfile; plain Enter does not', () => {
    render(<ProfileForm initialMarkdown='hello' />)
    const textarea = screen.getByLabelText('About (Markdown)') as HTMLTextAreaElement
    expectTextareaCmdEnterSubmits({ textarea, onSubmit: mockUpdateMyProfile })
  })
})
