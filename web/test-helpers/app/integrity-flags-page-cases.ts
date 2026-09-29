/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- registrars live outside *.test.* because jest/no-export forbids exporting them from test files, and oxfmt rewrites it() to test() there */
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, test, type Mock } from 'vitest'

export const integrityFlagsEmptyPage = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
}

const clientSelector = '[data-pw="integrity-flags-page-client"]'
const breadcrumbsSelector = '[data-pw="integrity-flags-page-breadcrumbs"]'

type IntegrityFlagsPage = (props: {
  searchParams: Promise<{ status?: string }>
}) => Promise<ReactNode>

function flagsClient() {
  const node = document.querySelector(clientSelector)
  expect(node).not.toBeNull()
  return node as HTMLElement
}

function registerSharedIntegrityFlagsPageCases(options: {
  Page: IntegrityFlagsPage
  getFlags: Mock
}): void {
  const { Page, getFlags } = options

  async function renderStatus(status?: string) {
    getFlags.mockResolvedValueOnce(integrityFlagsEmptyPage)
    render(await Page({ searchParams: Promise.resolve(status === undefined ? {} : { status }) }))
  }

  test('renders the flags client with default pending status', async () => {
    await renderStatus()
    expect(flagsClient()).toHaveTextContent('pending')
  })

  test('passes resolved status from searchParams', async () => {
    await renderStatus('resolved')
    expect(flagsClient()).toHaveTextContent('resolved')
  })

  test('passes all status from searchParams', async () => {
    await renderStatus('all')
    expect(flagsClient()).toHaveTextContent('all')
  })

  test('defaults to pending for unknown status values', async () => {
    await renderStatus('unknown')
    expect(flagsClient()).toHaveTextContent('pending')
  })

  test('renders breadcrumbs', async () => {
    await renderStatus()
    expect(screen.getByRole('navigation')).toBe(document.querySelector(breadcrumbsSelector))
  })
}

async function loadFlagsPage(
  Page: IntegrityFlagsPage,
  getFlags: Mock,
  status?: string,
): Promise<void> {
  getFlags.mockResolvedValueOnce(integrityFlagsEmptyPage)
  await Page({ searchParams: Promise.resolve(status === undefined ? {} : { status }) })
}

export function registerReportIntegrityFlagsPageCases(options: {
  Page: IntegrityFlagsPage
  getFlags: Mock
}): void {
  const { Page, getFlags } = options
  registerSharedIntegrityFlagsPageCases(options)

  test('calls getReportIntegrityFlags with pending status (no status param)', async () => {
    await loadFlagsPage(Page, getFlags)
    expect(getFlags).toHaveBeenCalledWith({
      searchParams: { status: 'pending' },
    })
  })

  test('calls getReportIntegrityFlags without status param for "all"', async () => {
    await loadFlagsPage(Page, getFlags, 'all')
    expect(getFlags).toHaveBeenCalledWith({
      searchParams: { status: undefined },
    })
  })
}

export function registerVoteIntegrityFlagsPageCases(options: {
  Page: IntegrityFlagsPage
  getFlags: Mock
}): void {
  const { Page, getFlags } = options
  registerSharedIntegrityFlagsPageCases(options)

  test('calls getVoteIntegrityFlags with pending status by default', async () => {
    await loadFlagsPage(Page, getFlags)
    expect(getFlags).toHaveBeenCalledWith({
      searchParams: { status: 'pending' },
    })
  })

  test('calls getVoteIntegrityFlags without status param for "all"', async () => {
    await loadFlagsPage(Page, getFlags, 'all')
    expect(getFlags).toHaveBeenCalledWith({
      searchParams: { status: undefined },
    })
  })
}
