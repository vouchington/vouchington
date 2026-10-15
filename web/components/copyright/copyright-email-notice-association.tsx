import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { EntityAutocomplete } from '@/components/shared/entity-autocomplete'
import { getCopyrightNoticeAssociationTarget } from '@/lib/api/client/copyright-notice-association-target'
import { isUUID } from '@ts-shared/utils/validation-core'

type NoticeTarget = Awaited<
  ReturnType<typeof getCopyrightNoticeAssociationTarget>
>['copyright_notice']

export function CopyrightEmailNoticeAssociation({
  loading,
  onAssociateWithNotice,
}: {
  loading: boolean
  onAssociateWithNotice: (noticeId: string) => void
}) {
  const [noticeId, setNoticeId] = useState('')
  const [searchFailed, setSearchFailed] = useState(false)
  return (
    <div className='flex flex-wrap gap-2'>
      <EntityAutocomplete<NoticeTarget>
        ariaLabel='Find existing copyright notice'
        emptyText='No matching notice'
        getItemValue={notice => notice.id}
        getKey={notice => notice.id}
        minQueryLength={36}
        onQueryChange={() => {
          setNoticeId('')
          setSearchFailed(false)
        }}
        onSearchError={() => setSearchFailed(true)}
        onSelect={(notice, { setQuery }) => {
          setNoticeId(notice.id)
          setQuery(`${notice.jurisdiction} notice · ${notice.received_at.slice(0, 10)}`)
        }}
        placeholder='Find existing copyright notice'
        renderItem={notice => (
          <span>{`${notice.jurisdiction} notice · ${notice.received_at.slice(0, 10)} · ${notice.id}`}</span>
        )}
        search={async (query, signal) => {
          if (!isUUID(query.trim())) return []
          const result = await getCopyrightNoticeAssociationTarget(query.trim(), signal)
          return [result.copyright_notice]
        }}
      />
      {searchFailed && <p role='alert'>We could not find that notice.</p>}
      <Button
        disabled={loading || !noticeId.trim()}
        onClick={() => onAssociateWithNotice(noticeId.trim())}
        variant='outline'
      >
        Associate with existing notice
      </Button>
    </div>
  )
}
