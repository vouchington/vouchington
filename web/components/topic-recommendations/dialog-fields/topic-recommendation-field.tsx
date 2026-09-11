'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { EditableState } from '../topic-recommendation-editable-state'
import type { TopicRecommendationDialogProps } from '../topic-recommendation-dialog-types'

export function TopicRecommendationField({
  disabled,
  editableState,
  fieldKey,
  id,
  kind,
  label,
  placeholder,
  setEditableState,
}: {
  disabled?: boolean
  editableState: EditableState
  fieldKey: keyof EditableState
  id: string
  kind: 'input' | 'textarea'
  label: string
  placeholder: string
  setEditableState: TopicRecommendationDialogProps['setEditableState']
}) {
  const control =
    kind === 'input' ? (
      <Input
        id={id}
        value={editableState[fieldKey]}
        disabled={disabled}
        placeholder={placeholder}
        onChange={event =>
          setEditableState(current =>
            current ? { ...current, [fieldKey]: event.target.value } : current,
          )
        }
      />
    ) : (
      <Textarea
        id={id}
        rows={fieldKey === 'topic_markdown' ? 6 : fieldKey === 'topic_hostnames' ? 4 : 3}
        value={editableState[fieldKey]}
        disabled={disabled}
        placeholder={placeholder}
        onChange={event =>
          setEditableState(current =>
            current ? { ...current, [fieldKey]: event.target.value } : current,
          )
        }
      />
    )
  return (
    <div className='space-y-2'>
      <Label htmlFor={id}>{label}</Label>
      {control}
    </div>
  )
}
