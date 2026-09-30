/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- oxfmt rewrites it() to test() outside *.test.* files, and jest/no-export forbids exporting this registrar from a test file */
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

type RejectableAction = {
  mockImplementationOnce: (implementation: () => Promise<never>) => unknown
}

export type ModQueueRejectedAction = {
  action: string
  error: Error
  fallback: string
}

export type ModQueueActionErrorCase<Item> = {
  action: string
  apiMock: RejectableAction
  buttonName: RegExp
  item: Item
  fallback: string
}

type ModQueueActionErrorTestsOptions<Item> = {
  reset: () => void
  cases: readonly ModQueueActionErrorCase<Item>[]
  renderItem: (item: Item) => void
  assertRejected: (rejected: ModQueueRejectedAction) => void
}

export function registerModQueueActionErrorTests<Item>(
  options: ModQueueActionErrorTestsOptions<Item>,
): void {
  const { reset, cases, renderItem, assertRejected } = options

  beforeEach(() => {
    vi.clearAllMocks()
    reset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test.each(cases)(
    'reports a rejected action and restores $action',
    async ({ action, apiMock, buttonName, item, fallback }) => {
      let rejectRequest: (reason?: unknown) => void = () => {}
      apiMock.mockImplementationOnce(
        () =>
          new Promise<never>((_resolve, reject) => {
            rejectRequest = reject
          }),
      )
      const error = new Error(`${action} failed`)

      renderItem(item)
      const button = screen.getByRole('button', { name: buttonName })
      fireEvent.click(button)
      await waitFor(() => expect(button).toBeDisabled())

      act(() => {
        rejectRequest(error)
      })

      await waitFor(() => expect(button).toBeEnabled())
      assertRejected({ action, error, fallback })
    },
  )
}
