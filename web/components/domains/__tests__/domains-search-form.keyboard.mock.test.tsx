import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'
import { DomainsSearchForm } from '../domains-search-form'

const mockPush = vi.fn<VitestLooseMock>()

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ push: mockPush }),
    }) as unknown as typeof import('next/navigation'),
)

describe('DomainsSearchForm — keyboard submit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.pushState({}, '', '/domains')
  })

  it('submits via Enter on the search input through the Next router', () => {
    const onSubmit = vi.fn<VitestLooseMock>()
    mockPush.mockImplementation(onSubmit)

    render(<DomainsSearchForm />)

    const input = screen.getByLabelText('Search domains') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'example.com' } })

    void expectInputEnterSubmits({ input, onSubmit })
    expect(mockPush).toHaveBeenCalledWith('/domains?query=example.com')
  })
})
