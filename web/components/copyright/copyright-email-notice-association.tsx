'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { EntityAutocomplete } from '@/components/shared/entity-autocomplete'
import {
  searchCopyrightNoticeAssociationTargets,
  type CopyrightNoticeAssociationChoice,
} from '@/lib/api/client/copyright-notice-association-search'

function label(notice: CopyrightNoticeAssociationChoice) {
  return `${notice.jurisdiction} · ${notice.received_at.slice(0, 10)} · ${notice.claimant_display_name?.trim() || 'Claimant unavailable'} · ${notice.work_description.trim() || 'Work unavailable'}`
}

export function CopyrightEmailNoticeAssociation({
  loading,
  onAssociateWithNotice,
}: {
  loading: boolean
  onAssociateWithNotice: (noticeId: string) => void
}) {
  const [noticeId, setNoticeId] = useState('')
  const [results, setResults] = useState<CopyrightNoticeAssociationChoice[]>([])
  const [after, setAfter] = useState<string | null>(null)
  const [searchFailed, setSearchFailed] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const queryRef = useRef('')

  async function loadMore() {
    if (!after || loadingMore) return
    const query = queryRef.current
    setLoadingMore(true)
    try {
      const page = await searchCopyrightNoticeAssociationTargets(query, after)
      if (queryRef.current !== query) return
      setResults(previous => [...previous, ...page.copyright_notices])
      setAfter(page.page_info.has_next_page ? page.page_info.end_cursor : null)
    } catch {
      if (queryRef.current === query) setSearchFailed(true)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className='flex flex-wrap gap-2'>
      <EntityAutocomplete<CopyrightNoticeAssociationChoice>
        ariaLabel='Find existing copyright notice'
        emptyText='No matching notice'
        getKey={notice => notice.id}
        minQueryLength={2}
        onQueryChange={query => {
          queryRef.current = query.trim()
          setNoticeId('')
          setResults([])
          setAfter(null)
          setSearchFailed(false)
        }}
        onSearchError={() => setSearchFailed(true)}
        onSelect={(notice, { setQuery }) => {
          setNoticeId(notice.id)
          setQuery(label(notice))
        }}
        placeholder='Search claimant, work or received date'
        renderItem={notice => <span>{label(notice)}</span>}
        results={results}
        footer={
          after ? (
            <Button
              disabled={loadingMore}
              onClick={loadMore}
              type='button'
              variant='ghost'
            >
              Load more notices
            </Button>
          ) : null
        }
        search={async (query, signal) => {
          const page = await searchCopyrightNoticeAssociationTargets(
            query.trim(),
            undefined,
            signal,
          )
          if (!signal.aborted) {
            setResults(page.copyright_notices)
            setAfter(page.page_info.has_next_page ? page.page_info.end_cursor : null)
          }
          return page.copyright_notices
        }}
      />
      {searchFailed && <p role='alert'>We could not search notices.</p>}
      <Button
        data-pw='copyright-email-notice-association-associate-notice'
        disabled={loading || !noticeId}
        onClick={() => onAssociateWithNotice(noticeId)}
        variant='outline'
      >
        Associate with existing notice
      </Button>
    </div>
  )
}
