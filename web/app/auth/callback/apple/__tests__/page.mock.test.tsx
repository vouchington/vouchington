import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'
import AppleCallbackPage from '../page'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockNav = createNavMock()
const originalLocationHref = window.location.href
const originalWindowLocationDescriptor = Object.getOwnPropertyDescriptor(window, 'location')
const originalCloseDescriptor = Object.getOwnPropertyDescriptor(window, 'close')
const originalOpenerDescriptor = Object.getOwnPropertyDescriptor(window, 'opener')

describe('Apple callback page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
    mockNav.setSearchParams('id_token=apple-id-token&state=return-state&userName=Ada%20Lovelace')
    window.history.replaceState(null, '', originalLocationHref)
    Object.defineProperty(window, 'close', {
      configurable: true,
      value: vi.fn<VitestLooseMock>(),
    })
  })

  afterEach(() => {
    restoreWindowProperty('close', originalCloseDescriptor)
    restoreWindowProperty('location', originalWindowLocationDescriptor)
    restoreWindowProperty('opener', originalOpenerDescriptor)
    window.history.replaceState(null, '', originalLocationHref)
  })

  it('redirects to the Apple native callback URL when no opener exists', async () => {
    const mockLocationAssign = vi.fn<VitestLooseMock>()
    setLocationMethod('assign', mockLocationAssign)

    render(<AppleCallbackPage />)

    expect(screen.getByText('Completing sign in...')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Completing Apple sign in' })).toHaveClass('sr-only')

    await waitFor(() => {
      expect(mockLocationAssign).toHaveBeenCalledTimes(1)
    })
    expect(mockLocationAssign).toHaveBeenCalledWith(
      'voucha://auth/apple/callback?id_token=apple-id-token&state=return-state&userName=Ada+Lovelace',
    )
    expect(window.close).not.toHaveBeenCalled()
  })

  it('redirects fragment callback params to the Apple native callback URL', async () => {
    mockNav.setSearchParams('')
    window.history.replaceState(
      null,
      '',
      '#id_token=fragment-token&state=fragment-state&name=Ada%20Lovelace',
    )
    const mockLocationAssign = vi.fn<VitestLooseMock>()
    setLocationMethod('assign', mockLocationAssign)

    render(<AppleCallbackPage />)

    await waitFor(() => {
      expect(mockLocationAssign).toHaveBeenCalledTimes(1)
    })
    expect(mockLocationAssign).toHaveBeenCalledWith(
      'voucha://auth/apple/callback?id_token=fragment-token&state=fragment-state&userName=Ada+Lovelace',
    )
  })

  it('posts Apple callback params to the opener when a popup is present', async () => {
    Object.defineProperty(window, 'opener', {
      configurable: true,
      value: { postMessage: vi.fn<VitestLooseMock>() },
    })
    const mockLocationAssign = vi.fn<VitestLooseMock>()
    setLocationMethod('assign', mockLocationAssign)

    render(<AppleCallbackPage />)

    await waitFor(() => {
      expect(window.opener?.postMessage).toHaveBeenCalledWith(
        {
          provider: 'apple',
          id_token: 'apple-id-token',
          state: 'return-state',
          userName: 'Ada Lovelace',
          error: null,
        },
        window.location.origin,
      )
    })
    expect(window.close).toHaveBeenCalled()
    expect(mockLocationAssign).not.toHaveBeenCalled()
  })
})

function restoreWindowProperty(
  propertyName: 'close' | 'location' | 'opener',
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(window, propertyName, descriptor)
  } else {
    delete (window as Window & Partial<Record<typeof propertyName, unknown>>)[propertyName]
  }
}

function setLocationMethod(method: 'assign', implementation: typeof window.location.assign) {
  const realLocation = window.location
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      origin: realLocation.origin,
      get hash() {
        return realLocation.hash
      },
      [method]: implementation,
    },
  })
}
