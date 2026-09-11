import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IdentityVerificationAttemptGrant } from '../identity-verification-attempt-grant'

const { mockGrantIdentityVerificationAttempt, mockToastSuccess, mockToastError } = vi.hoisted(
  () => ({
    mockGrantIdentityVerificationAttempt: vi.fn<VitestLooseMock>(),
    mockToastSuccess: vi.fn<VitestLooseMock>(),
    mockToastError: vi.fn<VitestLooseMock>(),
  }),
)

vi.mock(import('@/lib/api/client/identity-verification'), () => ({
  grantIdentityVerificationAttempt: mockGrantIdentityVerificationAttempt,
}))

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { success: mockToastSuccess, error: mockToastError },
    }) as unknown as typeof import('sonner'),
)

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function renderGrant() {
  const result = render(<IdentityVerificationAttemptGrant userId='user-1' />)
  const form = result.container.querySelector('form')!
  const note = screen.getByLabelText('Support note')
  const submit = result.container.querySelector(
    '[data-pw="user-admin-grant-identity-attempt-button"]',
  )!
  return { ...result, form, note, submit }
}

describe('IdentityVerificationAttemptGrant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not submit a blank support note', () => {
    const { form, note, submit } = renderGrant()

    expect(submit).toBeDisabled()
    fireEvent.change(note, { target: { value: '   ' } })
    expect(submit).toBeDisabled()
    fireEvent.submit(form)

    expect(mockGrantIdentityVerificationAttempt).not.toHaveBeenCalled()
    expect(mockToastSuccess).not.toHaveBeenCalled()
    expect(mockToastError).not.toHaveBeenCalled()
  })

  it('submits a trimmed support note and disables the form while pending', async () => {
    const pendingGrant = deferred<{ granted: true }>()
    mockGrantIdentityVerificationAttempt.mockReturnValue(pendingGrant.promise)
    const { form, note, submit } = renderGrant()

    fireEvent.change(note, { target: { value: '  verified provider outage  ' } })
    fireEvent.submit(form)

    expect(mockGrantIdentityVerificationAttempt).toHaveBeenCalledWith(
      'user-1',
      'verified provider outage',
    )
    expect(note).toBeDisabled()
    expect(submit).toBeDisabled()

    await act(async () => {
      pendingGrant.resolve({ granted: true })
    })

    expect(note).toHaveValue('')
    expect(mockToastSuccess).toHaveBeenCalledWith('Identity-verification retry granted.')
    expect(mockToastError).not.toHaveBeenCalled()
    expect(note).toBeEnabled()
    expect(submit).toBeDisabled()
  })

  it('shows the request error returned by the API', async () => {
    mockGrantIdentityVerificationAttempt.mockRejectedValue(new Error('Attempt is not eligible'))
    const { form, note } = renderGrant()

    fireEvent.change(note, { target: { value: 'Provider confirmation received' } })
    fireEvent.submit(form)

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Attempt is not eligible'))
    expect(note).toHaveValue('Provider confirmation received')
    expect(note).toBeEnabled()
    expect(mockToastSuccess).not.toHaveBeenCalled()
  })

  it('shows the fallback error when the request rejects a non-Error value', async () => {
    mockGrantIdentityVerificationAttempt.mockRejectedValue('unavailable')
    const { form, note } = renderGrant()

    fireEvent.change(note, { target: { value: 'Provider confirmation received' } })
    fireEvent.submit(form)

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Failed to grant identity-verification retry.'),
    )
    expect(note).toHaveValue('Provider confirmation received')
    expect(note).toBeEnabled()
    expect(mockToastSuccess).not.toHaveBeenCalled()
  })
})
