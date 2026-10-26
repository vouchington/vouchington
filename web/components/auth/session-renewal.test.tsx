import { ApiError } from '@vouchington/api-client'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SessionRenewal } from './session-renewal'

const DASHBOARD = '/admin/mq-dashboard'

describe('session renewal entry', () => {
  it('opens the protected target only after a successful browser renewal', async () => {
    const navigate = vi.fn<(href: string) => void>()
    const renewSession = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)

    await act(async () => {
      render(
        <SessionRenewal
          next={DASHBOARD}
          renewSession={renewSession}
          navigate={navigate}
        />,
      )
    })

    expect(renewSession).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledExactlyOnceWith(DASHBOARD)
  })

  it('keeps a transient failure on the renewal page for an explicit retry', async () => {
    const navigate = vi.fn<(href: string) => void>()
    const renewSession = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(true)
    render(
      <SessionRenewal
        next={DASHBOARD}
        renewSession={renewSession}
        navigate={navigate}
      />,
    )

    expect(await screen.findByRole('alert')).toBeVisible()
    expect(navigate).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    })
    expect(renewSession).toHaveBeenCalledTimes(2)
    expect(navigate).toHaveBeenCalledExactlyOnceWith(DASHBOARD)
  })

  it('sends only definitive invalid credentials to sign-in', async () => {
    const navigate = vi.fn<(href: string) => void>()
    const renewSession = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValue(
        new ApiError('Sign in to continue', 401, { code: 'SESSION_RELOGIN_REQUIRED' }),
      )

    await act(async () => {
      render(
        <SessionRenewal
          next={DASHBOARD}
          renewSession={renewSession}
          navigate={navigate}
        />,
      )
    })

    expect(navigate).toHaveBeenCalledExactlyOnceWith('/login?next=%2Fadmin%2Fmq-dashboard')
  })

  it('continues an in-scope DBSC request without using device cookies as authority', async () => {
    const navigate = vi.fn<(href: string) => void>()
    const renewSession = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValue(
        new ApiError('Browser proof required', 403, { code: 'DBSC_PROOF_REQUIRED' }),
      )

    await act(async () => {
      render(
        <SessionRenewal
          next={DASHBOARD}
          renewSession={renewSession}
          navigate={navigate}
        />,
      )
    })

    expect(navigate).toHaveBeenCalledExactlyOnceWith(DASHBOARD)
  })
})
