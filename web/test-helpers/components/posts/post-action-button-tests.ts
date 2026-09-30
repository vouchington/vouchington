/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- oxfmt rewrites it() to test() outside *.test.* files, and jest/no-export forbids exporting this registrar from a test file */
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, type Mock } from 'vitest'
import { createNavMock } from '@/test-helpers/next-navigation-mock'

const mockNav = createNavMock()

type MessageFailure = { kind: 'message'; mock: Mock; message: string }
type FallbackFailure = { kind: 'fallback'; mock: Mock; fallback: string }
type ActivateFailure = MessageFailure | FallbackFailure

type PostActionButtonTests = {
  postId: string
  inactiveLabel: string
  activeLabel: string
  activeAt: string
  renderAt: (timestamp: string | null) => void
  activate: Mock
  deactivate: Mock
  prepareActivate: () => void
  prepareDeactivate: () => void
  prepareActivateFailure: () => void
  reset: () => void
  activateFailure: ActivateFailure
}

function expectMessageFailure(failure: MessageFailure) {
  expect(failure.mock).toHaveBeenCalledWith(failure.message)
}

function expectFallbackFailure(failure: FallbackFailure) {
  expect(failure.mock).toHaveBeenCalledWith(
    expect.any(Error),
    expect.objectContaining({ fallback: failure.fallback }),
  )
}

function expectActivateFailure(failure: ActivateFailure) {
  if (failure.kind === 'message') {
    expectMessageFailure(failure)
    return
  }
  expectFallbackFailure(failure)
}

export function registerPostActionButtonTests(options: PostActionButtonTests): void {
  const {
    postId,
    inactiveLabel,
    activeLabel,
    activeAt,
    renderAt,
    activate,
    deactivate,
    prepareActivate,
    prepareDeactivate,
    prepareActivateFailure,
    reset,
    activateFailure,
  } = options

  beforeEach(() => {
    mockNav.reset()
    reset()
  })

  test(`renders ${inactiveLabel} and refreshes after the action succeeds`, async () => {
    prepareActivate()
    renderAt(null)
    const button = screen.getByRole('button', { name: inactiveLabel })
    fireEvent.click(button)
    expect(activate).toHaveBeenCalledWith(postId)
    expect(button).toHaveTextContent(activeLabel)
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-pressed', 'true')
      expect(mockNav.refresh).toHaveBeenCalled()
    })
  })

  test(`renders ${activeLabel} and refreshes after the action succeeds`, async () => {
    prepareDeactivate()
    renderAt(activeAt)
    const button = screen.getByRole('button', { name: activeLabel })
    fireEvent.click(button)
    expect(deactivate).toHaveBeenCalledWith(postId)
    expect(button).toHaveTextContent(inactiveLabel)
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-pressed', 'false')
      expect(mockNav.refresh).toHaveBeenCalled()
    })
  })

  test(`rolls back the optimistic ${inactiveLabel} toggle when the action fails`, async () => {
    prepareActivateFailure()
    renderAt(null)
    const button = screen.getByRole('button', { name: inactiveLabel })
    fireEvent.click(button)
    expect(button).toHaveTextContent(activeLabel)
    await waitFor(() => {
      expect(button).toHaveTextContent(inactiveLabel)
    })
    expect(mockNav.refresh).not.toHaveBeenCalled()
    expectActivateFailure(activateFailure)
  })
}
