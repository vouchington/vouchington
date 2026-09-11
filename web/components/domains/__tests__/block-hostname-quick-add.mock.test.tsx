import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BlockHostnameQuickAdd } from '../block-hostname-quick-add'

type SonnerModule = typeof import('sonner')

const mocks = vi.hoisted(() => ({
  refresh: vi.fn<VitestLooseMock>(),
  createHostname: vi
    .fn<VitestLooseMock>()
    .mockResolvedValue({ id: 'host-1', hostname: 'example.com' }),
  toastSuccess: vi.fn<VitestLooseMock>(),
  toastError: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  async importOriginal =>
    ({
      ...(await importOriginal()),
      useRouter: () => ({
        back: vi.fn<VitestLooseMock>(),
        forward: vi.fn<VitestLooseMock>(),
        prefetch: vi.fn<VitestLooseMock>(),
        push: vi.fn<VitestLooseMock>(),
        refresh: mocks.refresh,
        replace: vi.fn<VitestLooseMock>(),
      }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('sonner'), async importOriginal => {
  const actual = await importOriginal<SonnerModule>()
  return {
    ...actual,
    toast: Object.assign(vi.fn<VitestLooseMock>(), actual.toast, {
      success: mocks.toastSuccess,
      error: mocks.toastError,
    }),
  }
})

vi.mock(import('@/lib/api/client/hostnames'), () => ({
  createHostname: mocks.createHostname,
  updateHostname: vi.fn<VitestLooseMock>(),
  fetchHostnames: vi.fn<VitestLooseMock>(),
}))

describe('BlockHostnameQuickAdd', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when isAdmin is false', () => {
    const { container } = render(<BlockHostnameQuickAdd isAdmin={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the form when isAdmin is true', () => {
    render(<BlockHostnameQuickAdd isAdmin />)
    expect(document.querySelector('[data-pw="block-hostname-quick-add"]')).not.toBeNull()
  })

  it('submit button is disabled when input is empty', () => {
    render(<BlockHostnameQuickAdd isAdmin />)
    const submitButton = screen.getByRole('button', { name: 'Block hostname' })
    expect(submitButton).toHaveProperty('disabled', true)
  })

  it('submit button is enabled after typing a hostname', () => {
    render(<BlockHostnameQuickAdd isAdmin />)
    const input = screen.getByRole('textbox', { name: 'Hostname to block' })
    fireEvent.change(input, { target: { value: 'example.com' } })
    const submitButton = screen.getByRole('button', { name: 'Block hostname' })
    expect(submitButton).toHaveProperty('disabled', false)
  })

  it('opens confirmation dialog on submit', async () => {
    render(<BlockHostnameQuickAdd isAdmin />)
    const input = screen.getByRole('textbox', { name: 'Hostname to block' })
    fireEvent.change(input, { target: { value: 'example.com' } })
    fireEvent.submit(document.querySelector('[data-pw="block-hostname-quick-add"]')!)
    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeDefined()
    })
  })

  it('calls createHostname with blocked:true after confirmation', async () => {
    render(<BlockHostnameQuickAdd isAdmin />)
    const input = screen.getByRole('textbox', { name: 'Hostname to block' })
    fireEvent.change(input, { target: { value: 'example.com' } })
    fireEvent.submit(document.querySelector('[data-pw="block-hostname-quick-add"]')!)
    await waitFor(() => screen.getByRole('alertdialog'))
    fireEvent.click(screen.getByRole('button', { name: 'Block hostname' }))
    await waitFor(() => {
      expect(mocks.createHostname).toHaveBeenCalledWith({ hostname: 'example.com', blocked: true })
    })
  })

  it('calls router.refresh after successful block', async () => {
    render(<BlockHostnameQuickAdd isAdmin />)
    const input = screen.getByRole('textbox', { name: 'Hostname to block' })
    fireEvent.change(input, { target: { value: 'example.com' } })
    fireEvent.submit(document.querySelector('[data-pw="block-hostname-quick-add"]')!)
    await waitFor(() => screen.getByRole('alertdialog'))
    fireEvent.click(screen.getByRole('button', { name: 'Block hostname' }))
    await waitFor(() => {
      expect(mocks.refresh).toHaveBeenCalled()
    })
  })

  it('shows toast success after successful block', async () => {
    render(<BlockHostnameQuickAdd isAdmin />)
    const input = screen.getByRole('textbox', { name: 'Hostname to block' })
    fireEvent.change(input, { target: { value: 'example.com' } })
    fireEvent.submit(document.querySelector('[data-pw="block-hostname-quick-add"]')!)
    await waitFor(() => screen.getByRole('alertdialog'))
    fireEvent.click(screen.getByRole('button', { name: 'Block hostname' }))
    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith('example.com has been blocked')
    })
  })

  it('shows toast error when createHostname throws', async () => {
    mocks.createHostname.mockRejectedValueOnce(new Error('Server error'))
    render(<BlockHostnameQuickAdd isAdmin />)
    const input = screen.getByRole('textbox', { name: 'Hostname to block' })
    fireEvent.change(input, { target: { value: 'example.com' } })
    fireEvent.submit(document.querySelector('[data-pw="block-hostname-quick-add"]')!)
    await waitFor(() => screen.getByRole('alertdialog'))
    fireEvent.click(screen.getByRole('button', { name: 'Block hostname' }))
    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('Failed to block hostname')
    })
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
