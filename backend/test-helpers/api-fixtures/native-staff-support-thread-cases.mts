import type { ApiFixtureCase } from './types.mts'
import {
  adminId,
  shared,
  thread,
  threadId,
  threadRoute,
} from './native-staff-support-fixture-data.mts'

export const nativeStaffSupportThreadApiFixtureCases: ApiFixtureCase[] = [
  {
    ...shared,
    id: 'native.staff-support.threads.default',
    method: 'GET',
    path: '/api/v1/support/threads',
    query: { limit: '25', q: 'account', status: 'open' },
    route: { routeTemplate: '/api/v1/support/threads' },
    status: 200,
    body: {
      page_info: { end_cursor: null, has_next_page: false, start_cursor: threadId },
      results: [thread],
    },
  },
  {
    ...shared,
    id: 'native.staff-support.thread-detail.default',
    method: 'GET',
    path: `/api/v1/support/threads/${threadId}`,
    route: threadRoute(),
    status: 200,
    body: { thread },
  },
  {
    ...shared,
    id: 'native.staff-support.thread-assign.default',
    method: 'PATCH',
    path: `/api/v1/support/threads/${threadId}`,
    requestBody: { assigned_to_id: adminId },
    route: threadRoute(),
    status: 200,
    body: {
      thread: {
        ...thread,
        assigned_at: '2026-07-01T12:15:00.000Z',
        assigned_to_id: adminId,
        status: 'assigned',
      },
    },
  },
  {
    ...shared,
    id: 'native.staff-support.thread-resolve.default',
    method: 'PATCH',
    path: `/api/v1/support/threads/${threadId}`,
    requestBody: { resolved: true },
    route: threadRoute(),
    status: 200,
    body: {
      thread: {
        ...thread,
        resolved_at: '2026-07-01T12:20:00.000Z',
        resolved_by_id: adminId,
        status: 'resolved',
      },
    },
  },
  {
    ...shared,
    id: 'native.staff-support.thread-reopen.default',
    method: 'PATCH',
    path: `/api/v1/support/threads/${threadId}`,
    requestBody: { resolved: false },
    route: threadRoute(),
    status: 200,
    body: { thread },
  },
]
