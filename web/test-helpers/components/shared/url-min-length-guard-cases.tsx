/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- oxfmt rewrites it() to test() outside *.test.* files, and jest/no-export forbids exporting this registrar from a test file */
import { fireEvent, screen, waitFor, type RenderResult } from '@testing-library/react'
import { expect, test, type Mock } from 'vitest'

export function registerUrlMinLengthGuardCases(options: {
  renderControl: () => RenderResult
  placeholder: string
  clearedEmptyText: string
  mockFetch: Mock
  waitTimeout: number
  prepare?: () => Promise<void>
}): void {
  const { renderControl, placeholder, clearedEmptyText, mockFetch, waitTimeout, prepare } = options

  async function typeQuery(value: string): Promise<HTMLElement> {
    renderControl()
    await prepare?.()
    const input = screen.getByPlaceholderText(placeholder)
    fireEvent.change(input, { target: { value } })
    return input
  }

  test('does not call fetchUrls for a 1-character query', async () => {
    await typeQuery('h')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('does not call fetchUrls for a 2-character query', async () => {
    await typeQuery('ht')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('shows "Type at least 3 characters" hint for a 1-2 character query', async () => {
    await typeQuery('ht')
    expect(screen.getByTestId('command-empty').textContent).toContain('Type at least 3 characters')
  })

  test('calls fetchUrls once the query reaches 3 characters', async () => {
    await typeQuery('htt')
    await waitFor(() => expect(mockFetch).toHaveBeenCalledOnce(), {
      timeout: waitTimeout,
    })
  })

  test('shows default empty text when query is cleared after typing', async () => {
    const input = await typeQuery('ht')
    fireEvent.change(input, { target: { value: '' } })
    // query='', open=true: ternary false branch → the field's empty label
    expect(screen.getByTestId('command-empty').textContent).toContain(clearedEmptyText)
  })
}
