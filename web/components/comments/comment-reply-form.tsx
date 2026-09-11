/* oxlint-disable max-lines -- comment compose form with preview + required Turnstile and reCAPTCHA bot-protection wiring legitimately exceeds 200 */
'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CommentSignInPrompt } from './comment-sign-in-prompt'
import { CommentReplyPreview } from './comment-reply-preview'
import { TurnstileField } from '@/components/shared/turnstile-field'
import { useTurnstileToken } from '@/hooks/use-turnstile-token'
import { useRecaptchaToken } from '@/hooks/use-recaptcha-token'
import { createPost } from '@/lib/api/client/posts'
import { previewMarkdown } from '@/lib/api/client/markdown'
import onError, { onSuccess as notifySuccess } from '@/lib/on-error'
import { useAuth } from '@/lib/auth/context'
import type { Post } from '@/types/posts'
import { useTranslations } from '@/lib/i18n/use-translations'

interface CommentReplyFormProps {
  parentId: string
  rootId: string
  onSuccess: (comment: Post, html?: string) => void
  onCancel?: () => void
  showCancel?: boolean
  placeholder?: string
  initialMarkdown?: string
  dataPw?: string
}
export function CommentReplyForm({
  parentId,
  rootId,
  onSuccess,
  onCancel,
  showCancel = false,
  placeholder,
  initialMarkdown = '',
  dataPw = 'comment-reply-textarea',
}: CommentReplyFormProps) {
  const t = useTranslations()
  const resolvedPlaceholder =
    placeholder ?? t('extracted.comments.commentReplyForm.writeAComment_a89a1ed2')
  const { isAuthenticated } = useAuth()
  const [markdown, setMarkdown] = useState(initialMarkdown)
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  // Lazily mount the Turnstile widget once the user starts composing so a page
  // with many reply forms doesn't render dozens of widgets up front.
  const [showTurnstile, setShowTurnstile] = useState(initialMarkdown.trim().length > 0)
  const turnstile = useTurnstileToken()
  const recaptcha = useRecaptchaToken()
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const textareaId = useId()
  useEffect(() => {
    if (!showPreview) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setPreviewLoading(true)
      previewMarkdown(markdown, { signal: controller.signal })
        .then(({ html }) => setPreviewHtml(html))
        .catch(error => {
          if (!(error instanceof DOMException && error.name === 'AbortError')) {
            setPreviewHtml(
              `<p class="text-sm text-muted-foreground">${t('extracted.comments.commentReplyForm.previewUnavailableTryAgain_7ece44e2')}</p>`,
            )
          }
        })
        .finally(() => setPreviewLoading(false))
    }, 200)
    return () => {
      clearTimeout(timer)
      controller.abort()
      queueMicrotask(() => setPreviewLoading(false))
    }
  }, [showPreview, markdown, t])
  if (!isAuthenticated) {
    return <CommentSignInPrompt />
  }
  function adjustHeight() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!markdown.trim() || isSubmitting) return
    setIsSubmitting(true)

    try {
      const recaptchaToken = await recaptcha.execute('create_comment')
      const { post: comment } = await createPost({
        post_type: 'comment',
        parent_id: parentId,
        root_id: rootId,
        markdown: markdown.trim(),
        is_anonymous: isAnonymous,
        cf_turnstile_response: turnstile.token ?? undefined,
        recaptcha_token: recaptchaToken ?? undefined,
      })
      let html: string | undefined
      try {
        html = comment.markdown ? (await previewMarkdown(comment.markdown)).html : undefined
      } catch {
        html = undefined
      }
      setMarkdown('')
      setIsAnonymous(false)
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
      notifySuccess(t('extracted.comments.commentReplyForm.commentPosted_f79769cc'))
      onSuccess(comment, html)
    } catch (error) {
      onError(error, {
        fallback: t('extracted.comments.commentReplyForm.failedToPostComment_791ab06b'),
        tags: { form: 'comment-reply' },
      })
    } finally {
      // The token was consumed by the backend's verification; get a fresh one.
      turnstile.reset()
      setIsSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className='space-y-2'
    >
      <Label
        htmlFor={textareaId}
        className='sr-only'
      >
        {t('extracted.comments.commentReplyForm.comment_44f5e3fb')}
      </Label>
      {showPreview ? (
        <CommentReplyPreview
          previewHtml={previewHtml}
          previewLoading={previewLoading}
        />
      ) : (
        <Textarea
          ref={textareaRef}
          id={textareaId}
          name='comment'
          value={markdown}
          onChange={e => {
            setMarkdown(e.target.value)
            adjustHeight()
          }}
          onFocus={() => setShowTurnstile(true)}
          placeholder={resolvedPlaceholder}
          rows={3}
          disabled={isSubmitting}
          className='w-full resize-none'
          dir='auto'
          data-pw={dataPw}
        />
      )}
      {showTurnstile && <TurnstileField turnstile={turnstile} />}
      <div className='flex items-center gap-2 text-sm'>
        <Checkbox
          id={`anonymous-comment-${parentId}`}
          checked={isAnonymous}
          onCheckedChange={(checked: boolean | 'indeterminate') => setIsAnonymous(checked === true)}
        />
        <Label
          htmlFor={`anonymous-comment-${parentId}`}
          className='text-sm font-normal'
        >
          {t('extracted.comments.commentReplyForm.replyAnonymously_cddd88bd')}
        </Label>
      </div>
      <div className='flex items-center gap-2'>
        <Button
          type='submit'
          size='sm'
          loading={isSubmitting}
          disabled={!markdown.trim() || isSubmitting || !turnstile.token}
          data-pw='comment-reply-submit'
        >
          {isSubmitting
            ? t('extracted.comments.commentReplyForm.posting_e24da73e')
            : t('extracted.comments.commentReplyForm.reply_c253f451')}
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          onClick={() => setShowPreview(p => !p)}
        >
          {showPreview
            ? t('extracted.comments.commentReplyForm.edit_464c4ffd')
            : t('extracted.comments.commentReplyForm.preview_324b134f')}
        </Button>
        {showCancel && onCancel && (
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={onCancel}
            data-pw='comment-reply-cancel'
          >
            {t('extracted.comments.commentReplyForm.cancel_19766ed6')}
          </Button>
        )}
      </div>
    </form>
  )
}
