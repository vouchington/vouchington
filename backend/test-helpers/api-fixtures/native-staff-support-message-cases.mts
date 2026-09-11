import type { ApiFixtureCase } from './types.mts'
import {
  adminId,
  message,
  messageId,
  messageRoute,
  pageInfo,
  shared,
  threadId,
} from './native-staff-support-fixture-data.mts'

const collectionRoute = {
  routeTemplate: '/api/v1/support/threads/:threadId/messages',
  pathParams: { threadId },
}

export const nativeStaffSupportMessageApiFixtureCases: ApiFixtureCase[] = [
  {
    ...shared,
    id: 'native.staff-support.messages.default',
    method: 'GET',
    path: `/api/v1/support/threads/${threadId}/messages`,
    query: { limit: '50' },
    route: collectionRoute,
    status: 200,
    body: { page_info: { ...pageInfo, start_cursor: messageId }, results: [message] },
  },
  {
    ...shared,
    id: 'native.staff-support.message-create.default',
    method: 'POST',
    path: `/api/v1/support/threads/${threadId}/messages`,
    requestBody: { body_text: 'Saved outbound reply.' },
    route: collectionRoute,
    status: 201,
    body: {
      message: {
        ...message,
        body_html: '',
        body_text: 'Saved outbound reply.',
        created_by_id: adminId,
        direction: 'outbound',
        email_from: null,
        email_message_id: null,
        email_subject: null,
        email_to: null,
      },
    },
  },
  {
    ...shared,
    id: 'native.staff-support.draft-create.default',
    method: 'POST',
    path: `/api/v1/support/threads/${threadId}/drafts`,
    route: {
      routeTemplate: '/api/v1/support/threads/:threadId/drafts',
      pathParams: { threadId },
    },
    status: 202,
    body: { queued: true },
  },
  {
    ...shared,
    id: 'native.staff-support.message-edit.default',
    method: 'PATCH',
    path: `/api/v1/support/threads/${threadId}/messages/${messageId}`,
    requestBody: { body_text: 'Edited support draft.' },
    route: messageRoute(),
    status: 200,
    body: {
      message: {
        ...message,
        body_text: 'Edited support draft.',
        direction: 'outbound',
        drafted_at: '2026-07-01T12:22:00.000Z',
        edited_at: '2026-07-01T12:23:00.000Z',
        edited_by_id: adminId,
      },
    },
  },
  {
    ...shared,
    id: 'native.staff-support.message-approve.default',
    method: 'POST',
    path: `/api/v1/support/threads/${threadId}/messages/${messageId}/approvals`,
    route: {
      routeTemplate: '/api/v1/support/threads/:threadId/messages/:messageId/approvals',
      pathParams: { messageId, threadId },
    },
    status: 201,
    body: {
      message: {
        ...message,
        approved_at: '2026-07-01T12:24:00.000Z',
        approved_by_id: adminId,
        direction: 'outbound',
        drafted_at: '2026-07-01T12:22:00.000Z',
      },
    },
  },
  {
    ...shared,
    id: 'native.staff-support.message-send.default',
    method: 'POST',
    path: `/api/v1/support/threads/${threadId}/messages/${messageId}/sends`,
    route: {
      routeTemplate: '/api/v1/support/threads/:threadId/messages/:messageId/sends',
      pathParams: { messageId, threadId },
    },
    status: 201,
    body: {
      message: {
        ...message,
        approved_at: '2026-07-01T12:24:00.000Z',
        approved_by_id: adminId,
        direction: 'outbound',
        drafted_at: '2026-07-01T12:22:00.000Z',
        sent_at: '2026-07-01T12:25:00.000Z',
      },
    },
  },
]
