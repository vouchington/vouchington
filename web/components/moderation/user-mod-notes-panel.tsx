'use client'

import { useReducer, useTransition, useEffect, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { TimeAgo } from '@/components/shared/time-ago'
import onError, { onSuccess } from '@/lib/on-error'
import {
  getUserModerationContext,
  createUserModNote,
  deleteUserModNote,
} from '@/lib/api/client/users'
import { panelReducer } from './user-mod-notes-helpers'
import { UserModContextSummary } from './user-mod-context-summary'
import { useTranslations } from '@/lib/i18n/use-translations'

interface UserModNotesPanelProps {
  targetUserId: string
  communityId?: string | null
}

export function UserModNotesPanel({ targetUserId, communityId }: UserModNotesPanelProps) {
  const t = useTranslations()
  const router = useRouter()
  const [isRefreshing, startRefresh] = useTransition()
  const [ps, dispatch] = useReducer(panelReducer, { status: 'loading' })
  const [body, setBody] = useReducer((_: string, v: string) => v, '')
  const [deletingId, setDeletingId] = useReducer((_: string | null, v: string | null) => v, null)
  const [submitting, setSubmitting] = useReducer((_: boolean, v: boolean) => v, false)
  const communityIdForCreate = communityId ?? null

  useEffect(() => {
    let cancelled = false
    getUserModerationContext(targetUserId)
      .then(res => {
        if (!cancelled) dispatch({ type: 'loaded', context: res.context, notes: res.notes })
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [targetUserId])

  async function handleDelete(noteId: string) {
    setDeletingId(noteId)
    try {
      await deleteUserModNote(targetUserId, noteId)
      dispatch({ type: 'remove', noteId })
      startRefresh(() => router.refresh())
    } catch (error) {
      onError(error, {
        fallback: t('extracted.moderation.userModNotesPanel.failedToDeleteNote_6dbf20cd'),
        tags: { form: 'mod-note-delete' },
      })
    } finally {
      setDeletingId(null)
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = body.trim()
    if (!trimmed) return
    setSubmitting(true)
    try {
      const res = await createUserModNote(targetUserId, {
        body: trimmed,
        community_id: communityIdForCreate,
      })
      dispatch({ type: 'add', note: res.note })
      setBody('')
      onSuccess(t('extracted.moderation.userModNotesPanel.noteAdded_a7886ebc'))
      startRefresh(() => router.refresh())
    } catch (error) {
      onError(error, {
        fallback: t('extracted.moderation.userModNotesPanel.failedToAddNote_dfde4403'),
        tags: { form: 'mod-note-create' },
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      data-pw='user-mod-notes-panel'
      className='space-y-4'
    >
      {ps.status === 'loading' && (
        <p className='text-sm text-muted-foreground'>
          {t('extracted.moderation.userModNotesPanel.loading_ba3bbbe1')}
        </p>
      )}
      {ps.status === 'error' && (
        <p className='text-sm text-destructive'>
          {t('extracted.moderation.userModNotesPanel.failedToLoad_9cbf78a2')}
        </p>
      )}
      {ps.status === 'ready' && (
        <>
          <p className='text-sm font-semibold'>
            {t('extracted.moderation.userModNotesPanel.moderatorNotes_2a4b5ed6')}
          </p>
          <UserModContextSummary context={ps.context} />
          <div className='space-y-2'>
            {ps.notes.length === 0 ? (
              <p className='text-xs text-muted-foreground'>
                {t('extracted.moderation.userModNotesPanel.noNotesYet_57bde4de')}
              </p>
            ) : (
              ps.notes.map(note => (
                <div
                  key={note.id}
                  data-pw='mod-note-item'
                  className='space-y-1 rounded border p-2 text-xs'
                >
                  <p className='whitespace-pre-wrap break-words'>{note.body}</p>
                  <div className='flex items-center justify-between text-muted-foreground'>
                    <span className='font-mono'>{note.author_user_id.slice(0, 8)}</span>
                    <div className='flex items-center gap-2'>
                      <span>
                        {note.community_id
                          ? note.community_id.slice(0, 8)
                          : t('extracted.moderation.userModNotesPanel.global_8001c274')}
                      </span>
                      <TimeAgo date={note.created_at} />
                      <Button
                        size='touchSm'
                        variant='ghost'
                        data-pw='mod-note-delete'
                        aria-label={t('extracted.moderation.userModNotesPanel.deleteNote_b80e4f44')}
                        disabled={deletingId !== null || isRefreshing}
                        onClick={() => handleDelete(note.id)}
                      >
                        {t('extracted.moderation.userModNotesPanel.text_8db71ed2')}
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <form
            onSubmit={handleSubmit}
            className='space-y-2'
          >
            <Textarea
              data-pw='mod-note-body'
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder={t('extracted.moderation.userModNotesPanel.addAModeratorNote_de756503')}
              rows={3}
              className='text-sm'
            />
            <Button
              type='submit'
              size='sm'
              data-pw='mod-note-submit'
              disabled={submitting || !body.trim() || isRefreshing}
              loading={submitting}
            >
              {t('extracted.moderation.userModNotesPanel.addNote_63565c04')}
            </Button>
          </form>
        </>
      )}
    </div>
  )
}
