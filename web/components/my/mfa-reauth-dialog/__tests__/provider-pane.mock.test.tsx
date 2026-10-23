import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  available: true,
  apple: vi.fn<VitestLooseMock>(),
  google: vi.fn<VitestLooseMock>(),
  begin: vi.fn<typeof import('@/lib/api/client').beginSdkProviderReAuth>(),
  verify: vi.fn<typeof import('@/lib/api/client').verifySdkProviderReAuth>(),
  broker: vi.fn<typeof import('@/lib/auth/provider-reauth-broker').startBrokerProviderReAuth>(),
}))
vi.mock(import('@/hooks/use-apple-auth'), () => ({
  useAppleAuth: () => ({ isAvailable: mocks.available, isLoaded: true, login: mocks.apple }),
}))
vi.mock(import('@/hooks/use-google-auth'), () => ({
  useGoogleAuth: () => ({ isAvailable: mocks.available, isLoaded: true, login: mocks.google }),
}))
vi.mock(import('@/lib/api/client'), () => ({
  beginSdkProviderReAuth: mocks.begin,
  verifySdkProviderReAuth: mocks.verify,
}))
vi.mock(import('@/lib/auth/provider-reauth-broker'), () => ({
  startBrokerProviderReAuth: mocks.broker,
}))

import { ProviderReAuthPane } from '../provider-pane'

describe('linked provider confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.available = true
    mocks.begin.mockResolvedValue({
      flow_id: 'new-flow',
      nonce: 'new-nonce',
      expires_at: '2026-12-01T00:00:00Z',
    })
    mocks.verify.mockResolvedValue({ re_auth_token: 'fresh-proof' })
    mocks.apple.mockResolvedValue({ token: 'apple-assertion', nonce: 'new-nonce' })
    mocks.google.mockResolvedValue('google-assertion')
    mocks.broker.mockResolvedValue('broker-proof')
  })

  it.each(['apple', 'google'] as const)(
    'passes a new server nonce through %s before returning proof',
    async provider => {
      const onVerified = vi.fn<(token: string) => void>()
      render(
        <ProviderReAuthPane
          provider={provider}
          loading={false}
          setLoading={() => {}}
          onVerified={onVerified}
        />,
      )
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
      })
      expect(mocks.begin).toHaveBeenCalledExactlyOnceWith(provider)
      expect(mocks[provider]).toHaveBeenCalledExactlyOnceWith({ nonce: 'new-nonce' })
      expect(mocks.verify).toHaveBeenCalledExactlyOnceWith(
        provider,
        'new-flow',
        `${provider}-assertion`,
      )
      expect(onVerified).toHaveBeenCalledExactlyOnceWith('fresh-proof')
    },
  )

  it('uses the linked broker provider and returns its confirmation proof', async () => {
    const onVerified = vi.fn<(token: string) => void>()
    render(
      <ProviderReAuthPane
        provider='github'
        loading={false}
        setLoading={() => {}}
        onVerified={onVerified}
      />,
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
    })
    expect(mocks.broker).toHaveBeenCalledExactlyOnceWith('github')
    expect(mocks.begin).not.toHaveBeenCalled()
    expect(onVerified).toHaveBeenCalledExactlyOnceWith('broker-proof')
  })

  it('does not begin confirmation while the configured SDK is unavailable', () => {
    mocks.available = false
    render(
      <ProviderReAuthPane
        provider='google'
        loading={false}
        setLoading={() => {}}
        onVerified={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled()
    expect(mocks.begin).not.toHaveBeenCalled()
  })
})
