import { describe, expect, it, vi } from 'vitest'
import type { Page, Route } from '@playwright/test'
import {
  RSS_FEED_IMPORT_ROUTE_PATTERNS,
  mockCompletedRssFeedImport,
} from '../rss-feed-import-route-mocks.mts'

type RouteHandler = (route: Route) => Promise<unknown> | unknown

function createPage() {
  const routes: { handler: RouteHandler; pattern: string }[] = []
  const page = {
    route: vi.fn<(...args: Array<never>) => unknown>((pattern: string, handler: RouteHandler) => {
      routes.push({ handler, pattern })
      return Promise.resolve()
    }),
  } as unknown as Page
  return { page, routes }
}

function createRoute() {
  return {
    fulfill: vi.fn<(...args: Array<never>) => unknown>(async () => {}),
  } as unknown as Route & { fulfill: ReturnType<typeof vi.fn> }
}

function fulfilledBody(route: ReturnType<typeof createRoute>) {
  const call = route.fulfill.mock.calls[0]?.[0] as { body?: string } | undefined
  if (!call?.body) throw new Error('Expected route body')
  return JSON.parse(call.body) as Record<string, unknown>
}

describe('mockCompletedRssFeedImport', () => {
  it('registers submit and status routes for a completed RSS import', async () => {
    const { page, routes } = createPage()

    await mockCompletedRssFeedImport(page)

    expect(routes.map(route => route.pattern)).toEqual([
      RSS_FEED_IMPORT_ROUTE_PATTERNS.submit,
      RSS_FEED_IMPORT_ROUTE_PATTERNS.status('01900000-0000-7000-8000-000000000001'),
    ])
  })

  it('fulfills the submit route with the configured status URL', async () => {
    const { page, routes } = createPage()

    await mockCompletedRssFeedImport(page, {
      importId: '01900000-0000-7000-8000-000000000099',
      totalRows: 3,
    })

    const route = createRoute()
    await routes[0]?.handler(route)

    expect(route.fulfill).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: 'application/json',
        status: 201,
      }),
    )
    expect(fulfilledBody(route)).toMatchObject({
      import: {
        id: '01900000-0000-7000-8000-000000000099',
        total_rows: 3,
      },
      status_url: '/api/v1/my/import/rss-feeds/01900000-0000-7000-8000-000000000099',
    })
  })

  it('fulfills the status route with completed import counts and rows', async () => {
    const { page, routes } = createPage()

    await mockCompletedRssFeedImport(page, {
      completedRows: 1,
      failedRows: 1,
      rows: [{ input: 'https://example.com/feed.xml', status: 'source_created' }],
      totalRows: 2,
    })

    const route = createRoute()
    await routes[1]?.handler(route)

    expect(route.fulfill).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: 'application/json',
        status: 200,
      }),
    )
    expect(fulfilledBody(route)).toMatchObject({
      import: {
        completed_rows: 1,
        failed_rows: 1,
        pending_rows: 0,
        total_rows: 2,
      },
      rows: [{ input: 'https://example.com/feed.xml', status: 'source_created' }],
    })
  })

  it('preserves an explicit null completed timestamp for pending imports', async () => {
    const { page, routes } = createPage()

    await mockCompletedRssFeedImport(page, {
      completedAt: null,
      completedRows: 0,
      pendingRows: 2,
      totalRows: 2,
    })

    const route = createRoute()
    await routes[1]?.handler(route)

    expect(fulfilledBody(route)).toMatchObject({
      import: {
        completed_at: null,
        completed_rows: 0,
        pending_rows: 2,
        total_rows: 2,
      },
    })
  })
})
