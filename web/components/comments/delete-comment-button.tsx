'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { deletePost } from '@/lib/api/client/posts'
import onError, { onSuccess } from '@/lib/on-error'
import { EntityActionIcons } from '@/components/shared/entity-action-icons'
import { useTranslations } from '@/lib/i18n/use-translations'

export function DeleteCommentButton({
  commentId,
  onDeleted,
}: {
  commentId: string
  onDeleted: () => void
}) {
  const t = useTranslations()
  const [isDeleting, setIsDeleting] = useState(false)
  /* c8 ignore next -- icon alias is covered by Vitest; selected browser coverage does not visit comment delete */
  const DeleteIcon = EntityActionIcons.delete

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault()
    if (isDeleting) return
    setIsDeleting(true)
    try {
      await deletePost(commentId)
      onSuccess(t('extracted.comments.deleteCommentButton.commentDeleted_7199a134'))
      onDeleted()
    } catch (error) {
      onError(error, {
        fallback: t('extracted.comments.deleteCommentButton.failedToDeleteComment_c65a5314'),
        tags: { form: 'comment-delete' },
      })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          className='inline-flex min-h-6 min-w-6 items-center p-0 text-xs text-muted-foreground hover:text-foreground'
          data-pw='delete-comment-button'
        >
          <DeleteIcon data-icon='inline-start' />
          {t('extracted.comments.deleteCommentButton.delete_e2d0a549')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('extracted.comments.deleteCommentButton.deleteThisComment_4d92d7c5')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('extracted.comments.deleteCommentButton.thisCannotBeUndone_b545dd16')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            {t('extracted.comments.deleteCommentButton.cancel_19766ed6')}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isDeleting}
            onClick={handleDelete}
            data-pw='comment-delete-confirm-button'
          >
            {isDeleting
              ? t('extracted.comments.deleteCommentButton.deleting_685ecb98')
              : t('extracted.comments.deleteCommentButton.delete_e2d0a549')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
