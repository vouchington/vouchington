'use client'

import { useState } from 'react'
import onError, { onSuccess } from '@/lib/on-error'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { createCrmNote, deleteCrmNote } from '@/lib/api/client/crm'
import type { WebCrmNote } from '@/types/crm'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  contactId: string
  initialNotes: WebCrmNote[]
}

export function CrmContactNotes({ contactId, initialNotes }: Props) {
  const t = useTranslations()
  const [notes, setNotes] = useState(initialNotes)
  const [body, setBody] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setAdding(true)
    try {
      const { note } = await createCrmNote(contactId, body.trim())
      setNotes(prev => [note, ...prev])
      setBody('')
      onSuccess(t('extracted.contactid.crmContactNotes.noteAdded_a7886ebc'))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.contactid.crmContactNotes.failedToAddNote_dfde4403'),
        tags: { form: 'crm-note' },
      })
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(noteId: string) {
    setDeletingId(noteId)
    try {
      await deleteCrmNote(contactId, noteId)
      setNotes(prev => prev.filter(n => n.id !== noteId))
      onSuccess(t('extracted.contactid.crmContactNotes.noteDeleted_81f7d188'))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.contactid.crmContactNotes.failedToDeleteNote_6dbf20cd'),
        tags: { form: 'crm-note' },
      })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className='space-y-4'>
      <h3 className='text-sm font-medium text-foreground'>
        {t('extracted.contactid.crmContactNotes.notes_8a7525b1')}
      </h3>
      <form
        onSubmit={handleAdd}
        className='space-y-2'
      >
        <Textarea
          placeholder={t('extracted.contactid.crmContactNotes.addANote_b9648c4e')}
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={3}
          aria-label={t('extracted.contactid.crmContactNotes.noteBody_39ff9bdc')}
        />
        <Button
          type='submit'
          size='sm'
          loading={adding}
          disabled={adding || !body.trim()}
        >
          {adding
            ? t('extracted.contactid.crmContactNotes.adding_6c1f4a9d')
            : t('extracted.contactid.crmContactNotes.addNote_e582d3fb')}
        </Button>
      </form>
      {notes.length === 0 && (
        <p className='text-sm text-muted-foreground'>
          {t('extracted.contactid.crmContactNotes.noNotesYet_57bde4de')}
        </p>
      )}
      <div className='space-y-3'>
        {notes.map(note => (
          <div
            key={note.id}
            className='flex items-start gap-3 rounded-md border bg-muted/30 p-4'
          >
            <div className='flex-1'>
              <p className='whitespace-pre-wrap text-sm text-foreground'>{note.body}</p>
              <p
                className='mt-1 text-xs text-muted-foreground'
                suppressHydrationWarning
              >
                {new Date(note.created_at).toLocaleString()}
              </p>
            </div>
            <Button
              variant='ghost'
              size='sm'
              className='h-8 w-8 p-0 text-muted-foreground hover:text-destructive'
              onClick={() => handleDelete(note.id)}
              disabled={deletingId === note.id}
              aria-label={t('extracted.contactid.crmContactNotes.deleteNote_b80e4f44')}
            >
              <Trash2 className='h-4 w-4' />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
