'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  listCopyrightGuestCapabilities,
  type CopyrightGuestCapabilitiesPage,
  type CopyrightGuestCapabilitySummary,
} from '@/lib/api/client/copyright-guest'

export type CopyrightGuestCapabilityRow = CopyrightGuestCapabilitySummary & {
  status: 'active' | 'expired' | 'revoked'
}

type GuestCapabilityListState = {
  rows: CopyrightGuestCapabilityRow[]
  endCursor: string | null
  hasNextPage: boolean
  status: 'loading' | 'ready' | 'failed'
}

const initialState: GuestCapabilityListState = {
  rows: [],
  endCursor: null,
  hasNextPage: false,
  status: 'loading',
}

/** Loads a case's guest capabilities so staff can manage tokens after a reload. */
export function useCopyrightGuestCapabilities(noticeId: string) {
  const [state, setState] = useState(initialState)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let current = true
    void listCopyrightGuestCapabilities(noticeId)
      .then(page => {
        if (current) setState(fromPage(page, []))
      })
      .catch(() => {
        if (current) setState(previous => ({ ...previous, status: 'failed' }))
      })
    return () => {
      current = false
    }
  }, [noticeId, version])
  const reload = useCallback(() => setVersion(previous => previous + 1), [])
  const { endCursor } = state
  const loadOlder = useCallback(async () => {
    if (!endCursor) return
    const page = await listCopyrightGuestCapabilities(noticeId, { after: endCursor })
    setState(previous => fromPage(page, previous.rows))
  }, [endCursor, noticeId])
  return { ...state, reload, loadOlder }
}

function fromPage(
  page: CopyrightGuestCapabilitiesPage,
  previousRows: CopyrightGuestCapabilityRow[],
): GuestCapabilityListState {
  const now = Date.now()
  return {
    rows: [
      ...previousRows,
      ...page.copyright_guest_capabilities.map(capability => ({
        ...capability,
        status: capabilityStatus(capability, now),
      })),
    ],
    endCursor: page.page_info.end_cursor,
    hasNextPage: page.page_info.has_next_page,
    status: 'ready',
  }
}

function capabilityStatus(
  capability: CopyrightGuestCapabilitySummary,
  now: number,
): CopyrightGuestCapabilityRow['status'] {
  if (capability.revoked_at) return 'revoked'
  return Date.parse(capability.expires_at) <= now ? 'expired' : 'active'
}

/** Formats an instant for a datetime-local input in the viewer's time zone. */
export function toDateTimeLocalValue(ms: number): string {
  const date = new Date(ms)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}
