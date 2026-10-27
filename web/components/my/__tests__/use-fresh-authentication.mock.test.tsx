import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MfaStatus } from '@/types/user'

vi.mock(
  import('@/lib/api/client'),
  () =>
    ({
      getMfaStatusClient: vi.fn<VitestLooseMock>(),
    }) as unknown as typeof import('@/lib/api/client'),
)
vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<typeof import('@/lib/on-error').default>(),
}))

import { useFreshAuthentication } from '../use-fresh-authentication'
import { getMfaStatusClient } from '@/lib/api/client'
import onError from '@/lib/on-error'

const status: MfaStatus = { has_mfa: false, passkeys_count: 0, totp_count: 0 }

describe('fresh authentication request ownership', () => {
  beforeEach(() => vi.clearAllMocks())

  it('leaves the settings action untouched when method discovery fails', async () => {
    const failure = new Error('Method discovery unavailable')
    vi.mocked(getMfaStatusClient).mockRejectedValueOnce(failure)
    const { result } = renderHook(() => useFreshAuthentication())
    await act(async () => {
      await expect(result.current.requestAuthentication()).resolves.toBeNull()
    })
    expect(result.current.dialogProps.open).toBe(false)
    expect(onError).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({
        tags: { form: 'account-reauth' },
      }),
    )
  })

  it('cancels an open confirmation when its settings component unmounts', async () => {
    const { result, unmount } = renderHook(() => useFreshAuthentication(status))
    let pending!: Promise<string | null>
    act(() => {
      pending = result.current.requestAuthentication()
    })
    unmount()
    await expect(pending).resolves.toBeNull()
    await expect(result.current.requestAuthentication()).resolves.toBeNull()
  })

  it('settles discovery when the initiating settings component unmounts', async () => {
    const discovery = Promise.withResolvers<MfaStatus>()
    vi.mocked(getMfaStatusClient).mockReturnValueOnce(discovery.promise)
    const { result, unmount } = renderHook(() => useFreshAuthentication())
    const pending = result.current.requestAuthentication()
    unmount()
    discovery.resolve(status)
    await expect(pending).resolves.toBeNull()
  })

  it('ignores a cancelled confirmation completing after another request opens', async () => {
    const { result } = renderHook(() => useFreshAuthentication(status))
    let first!: Promise<string | null>
    act(() => {
      first = result.current.requestAuthentication()
    })
    const cancelled = result.current.dialogProps
    act(() => cancelled.onClose())
    await expect(first).resolves.toBeNull()

    let second!: Promise<string | null>
    act(() => {
      second = result.current.requestAuthentication()
    })
    const current = result.current.dialogProps
    act(() => {
      cancelled.onVerified('cancelled-proof')
      cancelled.onClose()
    })
    expect(result.current.dialogProps.open).toBe(true)
    act(() => current.onVerified('current-proof'))
    await expect(second).resolves.toBe('current-proof')
    expect(result.current.dialogProps.open).toBe(false)
  })

  it('settles replaced requests and ignores their later callbacks', async () => {
    const { result } = renderHook(() => useFreshAuthentication(status))
    let first!: Promise<string | null>
    act(() => {
      first = result.current.requestAuthentication()
    })
    const replaced = result.current.dialogProps
    let second!: Promise<string | null>
    act(() => {
      second = result.current.requestAuthentication()
    })
    await expect(first).resolves.toBeNull()
    act(() => replaced.onVerified('replaced-proof'))
    act(() => result.current.dialogProps.onClose())
    await expect(second).resolves.toBeNull()
  })
})
