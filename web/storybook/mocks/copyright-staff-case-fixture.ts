import { ClientRequest } from '@/lib/api/client/request'

let copyrightStaffCaseFixture = false
const previousGet = ClientRequest.prototype.get

const guestCapabilities = {
  copyright_guest_capabilities: [
    {
      id: 'capability-active',
      issued_at: '2026-10-01T00:00:00Z',
      issued_by_id: 'staff-1',
      issued_by_username: 'reviewer',
      expires_at: '2099-01-01T00:00:00Z',
      revoked_at: null,
    },
    {
      id: 'capability-revoked',
      issued_at: '2026-09-01T00:00:00Z',
      issued_by_id: 'staff-1',
      issued_by_username: 'reviewer',
      expires_at: '2099-01-01T00:00:00Z',
      revoked_at: '2026-09-02T00:00:00Z',
    },
  ],
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
}

const repeatInfringerAccounts = {
  copyright_repeat_infringer_accounts: [
    {
      account_user_id: 'user-uploader',
      incident_id: 'incident-1',
      is_operative: true,
      open_review_id: 'review-1',
      termination_in_effect: true,
    },
  ],
}

export function setCopyrightStaffCaseFixture(): void {
  copyrightStaffCaseFixture = true
}

export function clearCopyrightStaffCaseFixture(): void {
  copyrightStaffCaseFixture = false
}

ClientRequest.prototype.get = function storybookCopyrightStaffCaseGet<T>(
  endpoint: string,
  options?: Parameters<ClientRequest['get']>[1],
): Promise<T> {
  if (copyrightStaffCaseFixture) {
    if (endpoint.endsWith('/guest-capabilities')) return Promise.resolve(guestCapabilities as T)
    if (endpoint.endsWith('/repeat-infringer-accounts')) {
      return Promise.resolve(repeatInfringerAccounts as T)
    }
  }
  return previousGet.call(this, endpoint, options) as Promise<T>
}
