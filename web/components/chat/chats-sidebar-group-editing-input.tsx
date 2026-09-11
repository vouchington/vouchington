'use client'

import { useRef, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  conversationId: string
  editValue: string
  onEditChange: (value: string) => void
  onEditSave: (conversationId: string) => void
  onEditCancel: () => void
}

export function EditingInput({
  conversationId,
  editValue,
  onEditChange,
  onEditSave,
  onEditCancel,
}: Props) {
  const t = useTranslations()
  const inputRef = useRef<HTMLInputElement>(null)
  const didCompleteEditRef = useRef(false)

  useEffect(() => {
    didCompleteEditRef.current = false
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [conversationId])

  function saveEdit() {
    if (didCompleteEditRef.current) return
    didCompleteEditRef.current = true
    onEditSave(conversationId)
  }

  function cancelEdit() {
    if (didCompleteEditRef.current) return
    didCompleteEditRef.current = true
    onEditCancel()
  }

  return (
    <Input
      ref={inputRef}
      aria-label={t('extracted.chat.chatsSidebarGroupEditingInput.renameConversation_4f10b6dc')}
      className='h-8 border-none px-2 shadow-none focus-visible:ring-0'
      value={editValue}
      onChange={e => onEditChange(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault()
          saveEdit()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          cancelEdit()
        }
      }}
      onBlur={saveEdit}
      data-pw='chat-rename-input'
    />
  )
}
