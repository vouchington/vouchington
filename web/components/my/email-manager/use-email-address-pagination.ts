import { useMemo, useState } from 'react'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { getMyEmailAddressesClient } from '@/lib/api/client'
import type { ListResponse } from '@/types/api-responses'
import type { EmailAddress } from '@/types/user'

const EMPTY_EMAIL_ADDRESSES: EmailAddress[] = []

export function useEmailAddressPagination(
  initialData?: ListResponse<EmailAddress>,
  initialEmailAddresses?: EmailAddress[],
) {
  const legacyEmails = initialEmailAddresses ?? EMPTY_EMAIL_ADDRESSES
  const firstPage = useMemo(
    () =>
      initialData ?? {
        results: legacyEmails,
        page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      },
    [initialData, legacyEmails],
  )
  const pagination = usePaginatedList(
    firstPage,
    '/api/v1/my/email-addresses',
    {},
    {
      loadPage: after => getMyEmailAddressesClient({ after }),
    },
  )
  const [removedEmails, setRemovedEmails] = useState<ReadonlySet<string>>(() => new Set())
  const emailsByAddress = new Map<string, EmailAddress>()
  for (const page of pagination.pages) {
    for (const email of page.results) {
      if (!removedEmails.has(email.email_address) && !emailsByAddress.has(email.email_address)) {
        emailsByAddress.set(email.email_address, email)
      }
    }
  }

  return {
    emails: [...emailsByAddress.values()],
    pagination,
    resetToFirstPage: pagination.resetToFirstPage,
    removeEmail: (emailAddress: string) =>
      setRemovedEmails(previous => new Set(previous).add(emailAddress)),
    restoreEmail: (emailAddress: string) =>
      setRemovedEmails(previous => {
        const next = new Set(previous)
        next.delete(emailAddress)
        return next
      }),
  }
}
