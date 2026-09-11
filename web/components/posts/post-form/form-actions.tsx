'use client'

import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'

export function FormActions({
  isEdit,
  isSubmitting,
  disabled,
  onCancel,
}: {
  isEdit: boolean
  isSubmitting: boolean
  /** Fully-resolved submit gate (in-flight, uploading, invalid, or pending Turnstile). */
  disabled: boolean
  onCancel: () => void
}) {
  const t = useTranslations()
  return (
    <div className='flex flex-col gap-2 sm:flex-row'>
      <Button
        type='submit'
        className='w-full sm:w-auto'
        loading={isSubmitting}
        disabled={disabled}
        data-pw='post-form-submit'
      >
        {isSubmitting
          ? t('extracted.postForm.formActions.saving_dc85af8f')
          : isEdit
            ? t('extracted.postForm.formActions.saveChanges_35322b5b')
            : t('extracted.postForm.formActions.post_a5554622')}
      </Button>
      <Button
        type='button'
        variant='outline'
        className='w-full sm:w-auto'
        onClick={onCancel}
      >
        {t('extracted.postForm.formActions.cancel_19766ed6')}
      </Button>
    </div>
  )
}
