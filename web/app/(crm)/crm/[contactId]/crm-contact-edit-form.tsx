'use client'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useTranslations } from '@/lib/i18n/use-translations'
import { TextField, VerticalField } from './crm-contact-edit-form-fields'

export function CrmContactEditForm({
  fields,
  onCancel,
  onFieldChange,
  onSave,
  saving,
}: {
  fields: CrmContactEditFields
  onCancel: () => void
  onFieldChange: (field: keyof CrmContactEditFields, value: string) => void
  onSave: (e: React.FormEvent) => void
  saving: boolean
}) {
  const t = useTranslations()
  return (
    <form
      onSubmit={onSave}
      className='space-y-4'
    >
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
        <TextField
          id='edit-name'
          label={t('extracted.contactid.crmContactEditForm.name_dcd1d522')}
          value={fields.name}
          field='name'
          onFieldChange={onFieldChange}
          required
        />
        <TextField
          id='edit-email'
          label={t('extracted.contactid.crmContactEditForm.email_969ccbd3')}
          value={fields.email}
          field='email'
          onFieldChange={onFieldChange}
          type='email'
          required
        />
        <TextField
          id='edit-phone'
          label={t('extracted.contactid.crmContactEditForm.phone_63dceb88')}
          value={fields.phone}
          field='phone'
          onFieldChange={onFieldChange}
          placeholder={t('extracted.contactid.crmContactEditForm.optional_59be7133')}
        />
        <VerticalField
          value={fields.vertical}
          onFieldChange={onFieldChange}
        />
        <TextField
          id='edit-followers'
          label={t('extracted.contactid.crmContactEditForm.followerCount_7a3611a5')}
          value={fields.followerCount}
          field='followerCount'
          onFieldChange={onFieldChange}
          type='number'
          min='0'
          placeholder={t('extracted.contactid.crmContactEditForm.optional_59be7133')}
        />
      </div>
      <div className='space-y-1'>
        <Label htmlFor='edit-notes'>
          {t('extracted.contactid.crmContactEditForm.notes_8a7525b1')}
        </Label>
        <Textarea
          id='edit-notes'
          value={fields.notes}
          onChange={event => onFieldChange('notes', event.target.value)}
          rows={3}
          placeholder={t('extracted.contactid.crmContactEditForm.optionalNotes_0d457cb0')}
        />
      </div>
      <div className='flex gap-3'>
        <Button
          type='submit'
          size='sm'
          loading={saving}
          disabled={saving}
        >
          {saving
            ? t('extracted.contactid.crmContactEditForm.saving_dc85af8f')
            : t('extracted.contactid.crmContactEditForm.save_1509f561')}
        </Button>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={onCancel}
        >
          {t('extracted.contactid.crmContactEditForm.cancel_19766ed6')}
        </Button>
      </div>
    </form>
  )
}

export interface CrmContactEditFields {
  email: string
  followerCount: string
  name: string
  notes: string
  phone: string
  vertical: string
}
