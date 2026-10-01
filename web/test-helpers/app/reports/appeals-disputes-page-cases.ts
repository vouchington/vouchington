/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- oxfmt rewrites it() to test() outside *.test.* files, and jest/no-export forbids exporting this registrar from a test file */
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { expect, test, type Mock } from 'vitest'

type PageSearchParams = Record<string, string | string[] | undefined>

type ReportListPage = (props: { searchParams: Promise<PageSearchParams> }) => Promise<ReactElement>

type ListPageResponse = {
  page_info: {
    has_next_page: false
    end_cursor: null
  }
}

type AppealsDisputesPageCaseOptions = {
  Page: ReportListPage
  title: string
  staffCopy: string
  memberCopy: string
  getCurrentUser: Mock<VitestLooseMock>
  fetchList: Mock<VitestLooseMock>
  baseResponse: ListPageResponse
  fetchSearchParams: PageSearchParams
  expectedFetchArgs: {
    searchParams: {
      limit: number
      cursor: string
      status: string
    }
  }
  clientSelector: string
  fetchCaseName: string
  clientCaseName: string
}

export function registerAppealsDisputesPageCases(options: AppealsDisputesPageCaseOptions): void {
  const {
    Page,
    title,
    staffCopy,
    memberCopy,
    getCurrentUser,
    fetchList,
    baseResponse,
    fetchSearchParams,
    expectedFetchArgs,
    clientSelector,
    fetchCaseName,
    clientCaseName,
  } = options

  async function renderPage(searchParams: PageSearchParams) {
    return render(await Page({ searchParams: Promise.resolve(searchParams) }))
  }

  test('renders staff description for an administrator user', async () => {
    getCurrentUser.mockResolvedValue({ roles: ['administrator'] })
    fetchList.mockResolvedValueOnce(baseResponse)

    await renderPage({})

    expect(screen.getByText(title)).toBeVisible()
    expect(screen.getByText(staffCopy)).toBeVisible()
  })

  test('renders member description for a non-staff user', async () => {
    getCurrentUser.mockResolvedValue({ roles: [] })
    fetchList.mockResolvedValueOnce(baseResponse)

    await renderPage({})

    expect(screen.getByText(memberCopy)).toBeVisible()
  })

  test('renders staff description for a moderator user', async () => {
    getCurrentUser.mockResolvedValue({ roles: ['moderator'] })
    fetchList.mockResolvedValueOnce(baseResponse)

    await renderPage({})

    expect(screen.getByText(staffCopy)).toBeVisible()
  })

  // oxlint-disable-next-line vitest/valid-title, jest/valid-title -- each page file owns its fetch case title
  test(fetchCaseName, async () => {
    getCurrentUser.mockResolvedValue({ roles: [] })
    fetchList.mockResolvedValueOnce(baseResponse)

    await renderPage(fetchSearchParams)

    expect(fetchList).toHaveBeenCalledWith(expectedFetchArgs)
  })

  // oxlint-disable-next-line vitest/valid-title, jest/valid-title -- each page file owns its client case title
  test(clientCaseName, async () => {
    getCurrentUser.mockResolvedValue({ roles: [] })
    fetchList.mockResolvedValueOnce(baseResponse)

    const { container } = await renderPage({})

    expect(container.querySelector(clientSelector)).not.toBeNull()
  })
}
