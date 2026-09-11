import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'
import { ProfileLinks } from '../profile-links'

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
  createMyProfileLink: vi.fn<VitestLooseMock>(),
  deleteMyProfileLink: vi.fn<VitestLooseMock>(),
  reorderMyProfileLinks: vi.fn<VitestLooseMock>(),
  updateMyProfileLink: vi.fn<VitestLooseMock>(),
}))

import { createMyProfileLink } from '@/lib/api/client'

const mockCreate = vi.mocked(createMyProfileLink)

describe('ProfileLinks keyboard submit (create form)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockCreate.mockResolvedValue({
      profile_link: {
        id: 'link-1',
        link_type: 'url',
        url: 'https://example.com',
        handle: null,
        name: null,
        sort_order: 0,
      },
    } as never)
  })

  it('Enter on the URL input triggers createMyProfileLink', async () => {
    render(<ProfileLinks initialLinks={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /add link/i }))
    const input = screen.getByLabelText('URL') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'https://example.com' } })
    void expectInputEnterSubmits({ input, onSubmit: mockCreate })
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled()
    })
  })
})
