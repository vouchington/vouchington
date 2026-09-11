import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { LoginUrlCleanup } from './login-url-cleanup'

describe('LoginUrlCleanup', () => {
  let replaceStateSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    replaceStateSpy = vi.spyOn(window.history, 'replaceState')
  })

  afterEach(() => {
    replaceStateSpy.mockRestore()
  })

  it('should strip deep-link query params from the login url', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        href: 'http://localhost/login?emailAddress=tests%2Bprefill%40voucha.ai&otp=abcd1234',
      },
    })

    render(<LoginUrlCleanup enabled />)

    await waitFor(() => {
      expect(replaceStateSpy).toHaveBeenCalledWith(null, '', '/login')
    })
  })

  it('strips the hydrated MFA attempt while preserving navigation state', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        href: 'http://localhost/login?next=%2Fsettings&intent=follow&login_attempt_id=attempt-1#sign-in',
      },
    })

    render(<LoginUrlCleanup enabled />)

    await waitFor(() => {
      expect(replaceStateSpy).toHaveBeenCalledWith(
        null,
        '',
        '/login?next=%2Fsettings&intent=follow#sign-in',
      )
    })
  })

  it('does not replace the URL before login state hydration enables cleanup', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        href: 'http://localhost/login?login_attempt_id=attempt-1',
      },
    })

    render(<LoginUrlCleanup enabled={false} />)

    expect(replaceStateSpy).not.toHaveBeenCalled()
  })
})
