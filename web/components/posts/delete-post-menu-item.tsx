'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useDeletePost } from './use-delete-post'
import { useTranslations } from '@/lib/i18n/use-translations'

interface DeletePostMenuItemProps {
  postIdOrSlug: string
}

export function DeletePostMenuItem({ postIdOrSlug }: DeletePostMenuItemProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { isDeleting, handleDelete } = useDeletePost(postIdOrSlug)

  return (
    <>
      <DropdownMenuItem
        className='text-destructive focus:text-destructive'
        onSelect={e => {
          e.preventDefault()
          setOpen(true)
        }}
        data-pw='post-delete-trigger'
      >
        <Trash2 className='h-4 w-4' />
        {t('extracted.posts.deletePostMenuItem.delete_e2d0a549')}
      </DropdownMenuItem>
      <AlertDialog
        open={open}
        onOpenChange={setOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('extracted.posts.deletePostMenuItem.deletePost_e139251e')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('extracted.posts.deletePostMenuItem.areYouSureYouWantTo_851854c3')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t('extracted.posts.deletePostMenuItem.cancel_19766ed6')}
            </AlertDialogCancel>
            <AlertDialogAction
              className='bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90'
              disabled={isDeleting}
              onClick={e => {
                e.preventDefault()
                handleDelete().catch(() => undefined)
              }}
              data-pw='post-delete-confirm'
            >
              {isDeleting
                ? t('extracted.posts.deletePostMenuItem.deleting_685ecb98')
                : t('extracted.posts.deletePostMenuItem.delete_e2d0a549')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
