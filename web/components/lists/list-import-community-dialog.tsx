'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { importCommunityListClient } from '@/lib/api/client/lists'
import { useTranslations } from '@/lib/i18n/use-translations'

interface ListImportCommunityDialogProps {
  listId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported?: (result: { posts: number; items: number }) => void
}

export function ListImportCommunityDialog({
  listId,
  open,
  onOpenChange,
  onImported,
}: ListImportCommunityDialogProps) {
  const t = useTranslations()
  const [communitySlug, setCommunitySlug] = useState('')
  const [pending, setPending] = useState(false)

  async function handleImport() {
    const slug = communitySlug.trim()
    if (!slug) return
    setPending(true)
    try {
      const result = await importCommunityListClient(listId, slug)
      toast.success(
        t('extracted.lists.listImportCommunityDialog.importedCountItems_ca42c31b', {
          count: result.posts + result.items,
        }),
      )
      onImported?.(result)
      onOpenChange(false)
      setCommunitySlug('')
    } catch {
      toast.error(
        t('extracted.lists.listImportCommunityDialog.importFailedCheckTheCommunityName_1468d134'),
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent data-pw='import-community-dialog'>
        <DialogHeader>
          <DialogTitle>
            {t('extracted.lists.listImportCommunityDialog.importFromCommunity_0078950b')}
          </DialogTitle>
          <DialogDescription>
            {t('extracted.lists.listImportCommunityDialog.enterACommunityNameToCopy_a27d6bf6')}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-3'>
          <div className='space-y-1'>
            <Label htmlFor='community-slug'>
              {t('extracted.lists.listImportCommunityDialog.community_bb501d78')}
            </Label>
            <Input
              id='community-slug'
              placeholder={t('extracted.lists.listImportCommunityDialog.myCommunityName_15e595ff')}
              value={communitySlug}
              onChange={e => setCommunitySlug(e.target.value)}
              data-pw='import-community-id-input'
            />
          </div>
          <Button
            onClick={() => {
              void handleImport()
            }}
            disabled={pending || !communitySlug.trim()}
            data-pw='import-community-submit'
            className='w-full'
          >
            {pending
              ? t('extracted.lists.listImportCommunityDialog.importing_c01c4324')
              : t('extracted.lists.listImportCommunityDialog.import_2cff9baa')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
