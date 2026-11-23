import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { mockContinueOAuthLogin } from '@/test-helpers/components/auth/login-form.email.mock-support'
import {
  clearRuntimePublicConfigForTest,
  setRuntimePublicConfigForTest,
} from '@/test-helpers/runtime-public-config'

vi.mock(import('../mfa-step'), () => ({
  default: () => <div data-testid='mfa-step' />,
}))

const { toastMock } = vi.hoisted(() => {
  const mock = Object.assign(vi.fn<VitestLooseMock>(), {
    error: vi.fn<VitestLooseMock>(),
    success: vi.fn<VitestLooseMock>(),
  })
  return { toastMock: mock }
})

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: toastMock,
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/on-error'), () => ({
  default: (_err: unknown, options: { fallback: string }) => {
    toastMock.error(options.fallback)
    return options.fallback
  },
  onSuccess: (message: string) => {
    toastMock.success(message)
  },
}))

import { LoginForm } from '../login-form'

describe('LoginForm — OAuth error fallback', () => {
  beforeEach(() => {
    setRuntimePublicConfigForTest({ facebookAppId: 'test-fb-app-id' })
    vi.clearAllMocks()
  })

  afterEach(() => {
    clearRuntimePublicConfigForTest()
  })

  it('reports OAuth login failures via onError fallback', async () => {
    mockContinueOAuthLogin.mockRejectedValueOnce(new Error('OAuth failed'))

    render(<LoginForm />)
    fireEvent.click(await screen.findByRole('button', { name: /continue with facebook/i }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Unable to connect. Please try again.')
    })
  })
})
