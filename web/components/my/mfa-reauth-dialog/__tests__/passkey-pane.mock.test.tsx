import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makePasskey, makePasskeyList } from '@/test-helpers/api-responses/passkeys'

const mocks = vi.hoisted(() => ({
  list: vi.fn<typeof import('@/lib/api/client').getPasskeysClient>(),
  options: vi.fn<typeof import('@/lib/api/client').getPasskeyReAuthOptions>(),
  verify: vi.fn<typeof import('@/lib/api/client').verifyPasskeyReAuth>(),
  authenticate: vi.fn<typeof import('@simplewebauthn/browser').startAuthentication>(),
}))
vi.mock(import('@/lib/api/client'), () => ({
  getPasskeysClient: mocks.list,
  getPasskeyReAuthOptions: mocks.options,
  verifyPasskeyReAuth: mocks.verify,
}))
vi.mock(import('@simplewebauthn/browser'), () => ({ startAuthentication: mocks.authenticate }))

import { PasskeyReAuthPane } from '../passkey-pane'

describe('selected passkey confirmation', () => {
  beforeEach(() => vi.resetAllMocks())

  it('recovers from credential-list failure through the visible retry action', async () => {
    mocks.list
      .mockRejectedValueOnce(new Error('List unavailable'))
      .mockResolvedValueOnce(makePasskeyList())
    render(
      <PasskeyReAuthPane
        loading={false}
        setLoading={() => {}}
        onVerified={() => {}}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('button', { name: 'Travel key' })).toBeVisible()
    expect(mocks.list).toHaveBeenCalledTimes(2)
  })

  it('keeps named credentials on later pages reachable', async () => {
    const later = makePasskey({ id: '00000000-0000-7000-8000-000000000102', name: 'Desk key' })
    mocks.list
      .mockResolvedValueOnce(
        makePasskeyList(undefined, { has_next_page: true, end_cursor: 'next-cursor' }),
      )
      .mockResolvedValueOnce(makePasskeyList([later]))
    render(
      <PasskeyReAuthPane
        loading={false}
        setLoading={() => {}}
        onVerified={() => {}}
      />,
    )
    await screen.findByRole('button', { name: 'Travel key' })
    fireEvent.click(screen.getByRole('button', { name: /load more/i }))
    expect(await screen.findByRole('button', { name: 'Desk key' })).toBeVisible()
    expect(mocks.list).toHaveBeenLastCalledWith({ after: 'next-cursor' })
  })

  it('does not submit a confirmation proof after browser cancellation', async () => {
    mocks.list.mockResolvedValue(makePasskeyList())
    mocks.options.mockResolvedValue({
      flow_id: 'cancelled-flow',
      options: { challenge: 'bm9uY2U' },
    })
    mocks.authenticate.mockRejectedValue(
      Object.assign(new Error('Cancelled'), { name: 'NotAllowedError' }),
    )
    const onVerified = vi.fn<(token: string) => void>()
    render(
      <PasskeyReAuthPane
        loading={false}
        setLoading={() => {}}
        onVerified={onVerified}
      />,
    )
    const selected = await screen.findByRole('button', { name: 'Travel key' })
    await act(async () => {
      fireEvent.click(selected)
    })
    expect(mocks.verify).not.toHaveBeenCalled()
    expect(onVerified).not.toHaveBeenCalled()
    expect(selected).toBeVisible()
  })

  it('uses the named credential and its fresh browser assertion for the same flow', async () => {
    const credential = makePasskey()
    const options = { challenge: 'bm9uY2U', userVerification: 'preferred' as const }
    const response = {
      id: 'credential',
      rawId: 'Y3JlZGVudGlhbA',
      type: 'public-key' as const,
      response: { authenticatorData: 'YXV0aA', clientDataJSON: 'e30', signature: 'c2ln' },
      clientExtensionResults: {},
    }
    mocks.list.mockResolvedValue(makePasskeyList([credential]))
    mocks.options.mockResolvedValue({ flow_id: 'selected-flow', options })
    mocks.authenticate.mockResolvedValue(response)
    mocks.verify.mockResolvedValue({ re_auth_token: 'fresh-proof' })
    const onVerified = vi.fn<(token: string) => void>()
    render(
      <PasskeyReAuthPane
        loading={false}
        setLoading={() => {}}
        onVerified={onVerified}
      />,
    )
    const selected = await screen.findByRole('button', { name: credential.name })
    await act(async () => {
      fireEvent.click(selected)
    })
    expect(mocks.options).toHaveBeenCalledExactlyOnceWith(credential.id)
    expect(mocks.authenticate).toHaveBeenCalledExactlyOnceWith({ optionsJSON: options })
    expect(mocks.verify).toHaveBeenCalledExactlyOnceWith(credential.id, 'selected-flow', response)
    expect(onVerified).toHaveBeenCalledExactlyOnceWith('fresh-proof')
  })
})
