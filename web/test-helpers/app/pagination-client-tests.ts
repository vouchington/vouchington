/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- oxfmt rewrites it() to test() outside *.test.* files, and jest/no-export forbids exporting this registrar from a test file */
import { fireEvent, screen, waitFor, type RenderResult } from '@testing-library/react'
import { beforeEach, expect, test, vi, type Mock } from 'vitest'

type ListedMessage = { id: string }

type CursorPage<T extends ListedMessage> = {
  results: T[]
  page_info: {
    has_next_page: boolean
    start_cursor: string | null
    end_cursor: string | null
  }
}

function makeCursorPage<T extends ListedMessage>(
  results: T[],
  hasNextPage: boolean,
  endCursor: string | null,
): CursorPage<T> {
  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: results.length > 0 ? `start-${results[0]!.id}` : null,
      end_cursor: endCursor,
    },
  }
}

type PaginationClientTests = {
  loadMoreButton: (container: HTMLElement) => Element | null
  fetchPage: Mock
  onError: Mock
  renderInitial: () => RenderResult
  rerenderOtherContext: (rerender: RenderResult['rerender']) => void
  duplicatedOlderMessages: () => ListedMessage[]
  olderMessage: () => ListedMessage
  staleMessage: () => ListedMessage
  staleContextName: string
}

function pendingPage() {
  let resolve: (value: unknown) => void = () => undefined
  const promise = new Promise<unknown>(res => {
    resolve = res
  })
  return {
    promise,
    resolve: (value: unknown) => resolve(value),
  }
}

function terminalPage(messages: ListedMessage[]) {
  return makeCursorPage(messages, false, null)
}

/** Shared continuation behavior for message-list clients. Call from a literal `describe`. */
export function registerPaginationClientTests(options: PaginationClientTests): void {
  const {
    loadMoreButton,
    fetchPage,
    onError,
    renderInitial,
    rerenderOtherContext,
    duplicatedOlderMessages,
    olderMessage,
    staleMessage,
    staleContextName,
  } = options

  function clickLoadMore(container: HTMLElement) {
    const button = loadMoreButton(container)
    if (button === null) throw new Error('missing load-more control')
    fireEvent.click(button)
  }

  beforeEach(() => {
    vi.resetAllMocks()
  })

  test('allows only one continuation request for rapid clicks', async () => {
    const pending = pendingPage()
    fetchPage.mockReturnValueOnce(pending.promise)
    const { container } = renderInitial()
    clickLoadMore(container)
    clickLoadMore(container)
    expect(fetchPage).toHaveBeenCalledTimes(1)
    pending.resolve(terminalPage([]))
    await waitFor(() => expect(loadMoreButton(container)).toBeNull())
  })

  test('deduplicates stable IDs across and within an older page', async () => {
    fetchPage.mockResolvedValueOnce(terminalPage(duplicatedOlderMessages()))
    const { container } = renderInitial()
    clickLoadMore(container)
    await waitFor(() => expect(screen.getAllByText('Message older')).toHaveLength(1))
    expect(screen.getAllByText('Message newest')).toHaveLength(1)
  })

  test(`rejects a continuation response from a stale ${staleContextName} context`, async () => {
    const pending = pendingPage()
    fetchPage.mockReturnValueOnce(pending.promise)
    const { container, rerender } = renderInitial()
    clickLoadMore(container)
    rerenderOtherContext(rerender)
    pending.resolve(terminalPage([staleMessage()]))
    await waitFor(() => expect(screen.getByText('Message fresh')).toBeDefined())
    expect(screen.queryByText('Message stale')).toBeNull()
  })

  test('preserves messages and shows a working retry after continuation failure', async () => {
    const error = new Error('network failure')
    fetchPage.mockRejectedValueOnce(error).mockResolvedValueOnce(terminalPage([olderMessage()]))
    const { container } = renderInitial()
    clickLoadMore(container)
    const retry = await screen.findByRole('button', { name: 'Retry' })
    expect(screen.getByText('Message newest')).toBeDefined()
    expect(onError).toHaveBeenCalledWith(error, expect.any(Object))
    fireEvent.click(retry)
    await waitFor(() => expect(screen.getByText('Message older')).toBeDefined())
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })
}
