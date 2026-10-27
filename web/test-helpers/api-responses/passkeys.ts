import type { Passkey } from '@/types/user'
import type { ListResponse } from '@/types/api-responses'

export function makePasskey(overrides: Partial<Passkey> = {}): Passkey {
  return {
    id: '00000000-0000-7000-8000-000000000101',
    name: 'Travel key',
    device_type: 'singleDevice',
    is_backed_up: false,
    created_at: '2026-07-01T00:00:00Z',
    last_used_at: null,
    ...overrides,
  }
}

export function makePasskeyList(
  results = [makePasskey()],
  pageInfo: Partial<ListResponse<Passkey>['page_info']> = {},
): ListResponse<Passkey> {
  return {
    results,
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null, ...pageInfo },
  }
}
