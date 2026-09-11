'use client'

import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { updatePost } from '@/lib/api/client/posts'
import onError, { onSuccess } from '@/lib/on-error'
import type { Post } from '@/types/posts'
import { useTranslations } from '@/lib/i18n/use-translations'

export function CommentNodeEditForm({
  post,
  onSave,
  onCancel,
}: {
  post: Post
  onSave: (updatedPost: Post) => void
  onCancel: () => void
}) {
  const t = useTranslations()
  const [markdown, setMarkdown] = useState(post.markdown ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const textareaId = useId()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!markdown.trim() || isSubmitting) return
    setIsSubmitting(true)
    try {
      const { post: updatedPost } = await updatePost(post.id, { markdown: markdown.trim() })
      onSuccess(t('extracted.comments.commentNodeEditForm.commentUpdated_651de1d5'))
      onSave(updatedPost)
    } catch (error) {
      onError(error, {
        fallback: t('extracted.comments.commentNodeEditForm.failedToSaveComment_78443791'),
        tags: { form: 'comment-edit' },
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className='mb-2 space-y-2'
      data-pw='comment-edit-form'
    >
      <Label
        htmlFor={textareaId}
        className='sr-only'
      >
        {t('extracted.comments.commentNodeEditForm.editComment_4f346f77')}
      </Label>
      <Textarea
        id={textareaId}
        name='comment'
        value={markdown}
        onChange={e => setMarkdown(e.target.value)}
        rows={3}
        disabled={isSubmitting}
        className='w-full'
        dir='auto'
        data-pw='comment-edit-textarea'
      />
      <div className='flex items-center gap-2'>
        <Button
          type='submit'
          size='sm'
          loading={isSubmitting}
          disabled={!markdown.trim() || isSubmitting}
          data-pw='comment-edit-save-button'
        >
          {isSubmitting
            ? t('extracted.comments.commentNodeEditForm.saving_dc85af8f')
            : t('extracted.comments.commentNodeEditForm.save_1509f561')}
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          onClick={onCancel}
          disabled={isSubmitting}
        >
          {t('extracted.comments.commentNodeEditForm.cancel_19766ed6')}
        </Button>
      </div>
    </form>
  )
}
