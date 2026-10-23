import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OAuthCancelledError } from '@/lib/auth/oauth-error'

vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<typeof import('@/lib/on-error').default>(),
}))

import onError from '@/lib/on-error'
import { useReAuthVerification } from '../use-reauth-verification'

describe('fresh factor verification completion', () => {
  beforeEach(() => vi.clearAllMocks())

  it('admits one active verification and returns its proof once', async () => {
    const proof = Promise.withResolvers<string>()
    const verify = vi.fn<() => Promise<string>>(() => proof.promise)
    const onVerified = vi.fn<(token: string) => void>()
    const setLoading = vi.fn<(loading: boolean) => void>()
    const { result } = renderHook(() => useReAuthVerification({ onVerified, setLoading }))
    let completion!: Promise<void>
    act(() => {
      completion = result.current(verify)
      void result.current(verify)
    })
    expect(verify).toHaveBeenCalledOnce()
    expect(setLoading).toHaveBeenCalledWith(true)
    await act(async () => {
      proof.resolve('fresh-proof')
      await completion
    })
    expect(onVerified).toHaveBeenCalledExactlyOnceWith('fresh-proof')
    expect(setLoading).toHaveBeenLastCalledWith(false)
  })

  it.each([
    new OAuthCancelledError('Google'),
    Object.assign(new Error('Passkey cancelled'), { name: 'NotAllowedError' }),
  ])('leaves the pending change untouched after cancellation: $name', async cancellation => {
    const onVerified = vi.fn<(token: string) => void>()
    const setLoading = vi.fn<(loading: boolean) => void>()
    const { result } = renderHook(() => useReAuthVerification({ onVerified, setLoading }))
    await act(() =>
      result.current(async () => {
        throw cancellation
      }),
    )
    expect(onVerified).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(setLoading).toHaveBeenLastCalledWith(false)
  })

  it('reports a failed assertion without approving a change', async () => {
    const onVerified = vi.fn<(token: string) => void>()
    const setLoading = vi.fn<(loading: boolean) => void>()
    const failure = new Error('Provider assertion rejected')
    const { result } = renderHook(() => useReAuthVerification({ onVerified, setLoading }))
    await act(() =>
      result.current(async () => {
        throw failure
      }),
    )
    expect(onVerified).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({
        tags: { form: 'account-reauth' },
      }),
    )
    expect(setLoading).toHaveBeenLastCalledWith(false)
  })

  it('ignores an outstanding proof after its dialog unmounts', async () => {
    const proof = Promise.withResolvers<string>()
    const onVerified = vi.fn<(token: string) => void>()
    const setLoading = vi.fn<(loading: boolean) => void>()
    const { result, unmount } = renderHook(() => useReAuthVerification({ onVerified, setLoading }))
    const completion = result.current(() => proof.promise)
    unmount()
    proof.resolve('late-proof')
    await completion
    expect(onVerified).not.toHaveBeenCalled()
    expect(setLoading).toHaveBeenCalledExactlyOnceWith(true)
  })
})
