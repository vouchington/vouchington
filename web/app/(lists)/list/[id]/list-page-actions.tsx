'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { ListImportCommunityDialog } from '@/components/lists/list-import-community-dialog'
import { useTranslations } from '@/lib/i18n/use-translations'

interface ListPageActionsProps {
  listId: string
}

export function ListPageActions({ listId }: ListPageActionsProps) {
  const t = useTranslations()
  const router = useRouter()
  const [importOpen, setImportOpen] = useState(false)

  function copyLink() {
    const url = `${window.location.origin}/list/${listId}`
    void navigator.clipboard.writeText(url).then(() => toast.success('Link copied'))
  }

  return (
    <div
      className='flex shrink-0 items-center gap-2'
      data-pw='list-page-actions'
    >
      <Button
        variant='outline'
        size='sm'
        onClick={copyLink}
        data-pw='list-copy-link'
      >
        {t('extracted.id.listPageActions.copyLink_dbf362d4')}
      </Button>
      <Button
        variant='outline'
        size='sm'
        onClick={() => setImportOpen(true)}
        data-pw='list-import-community'
      >
        {t('extracted.id.listPageActions.importFromCommunity_2da21151')}
      </Button>
      <ListImportCommunityDialog
        listId={listId}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => router.refresh()}
      />
    </div>
  )
}
