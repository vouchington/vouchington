'use client'

import { Button } from '@/components/ui/button'
import type { ReferralLinkValidationRule } from '@/lib/api/client/referral-link-validations'
import { useTranslations } from '@/lib/i18n/use-translations'
import { ValidationRuleForm } from './validation-rule-form'

function RuleTypeLabel({ rule }: { rule: ReferralLinkValidationRule }) {
  const t = useTranslations()
  if (rule.is_invalid_referral_link_url)
    return (
      <span className='text-yellow-600'>
        {t('extracted.referralLinkValidations.validationRulesTable.blocked_18f2a094')}
      </span>
    )
  if (rule.is_referral_link_url)
    return (
      <span className='text-green-600'>
        {t('extracted.referralLinkValidations.validationRulesTable.valid_f5162206')}
      </span>
    )
  return (
    <span className='text-destructive'>
      {t('extracted.referralLinkValidations.validationRulesTable.invalid_96c34a07')}
    </span>
  )
}

interface ValidationRuleRowProps {
  rule: ReferralLinkValidationRule
  validationId: string
  isEditing: boolean
  isDeleting: boolean
  onEdit: () => void
  onSaved: (updated: ReferralLinkValidationRule) => void
  onCancelEdit: () => void
  onDeleteRequest: () => void
}

export function ValidationRuleRow({
  rule,
  validationId,
  isEditing,
  isDeleting,
  onEdit,
  onSaved,
  onCancelEdit,
  onDeleteRequest,
}: ValidationRuleRowProps) {
  const t = useTranslations()
  if (isEditing)
    return (
      <tr>
        <td
          colSpan={6}
          className='px-4 py-4'
        >
          <ValidationRuleForm
            validationId={validationId}
            existing={rule}
            onSaved={onSaved}
            onCancel={onCancelEdit}
          />
        </td>
      </tr>
    )
  return (
    <tr>
      <td className='whitespace-nowrap px-4 py-3 text-sm text-foreground'>{rule.hostname}</td>
      <td className='whitespace-nowrap px-4 py-3 text-sm text-muted-foreground'>{rule.pathname}</td>
      <td className='whitespace-nowrap px-4 py-3 text-sm'>
        <RuleTypeLabel rule={rule} />
      </td>
      <td className='max-w-xs truncate px-4 py-3 text-sm text-muted-foreground'>
        {rule.user_error_text ?? '—'}
      </td>
      <td className='px-4 py-3 text-sm text-muted-foreground'>
        {rule.example_urls && rule.example_urls.length > 0
          ? rule.example_urls.slice(0, 2).join(', ')
          : '—'}
      </td>
      <td
        className='whitespace-nowrap px-4 py-3 text-sm'
        aria-label={t(
          'extracted.referralLinkValidations.validationRuleRow.actionsForHostnamePathname_202a8deb',
          {
            hostname: rule.hostname,
            pathname: rule.pathname,
          },
        )}
      >
        <div className='flex gap-2'>
          <Button
            size='sm'
            variant='outline'
            onClick={onEdit}
            // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
            data-pw={`rule-edit-${rule.id}`}
          >
            {t('extracted.referralLinkValidations.validationRulesTable.edit_464c4ffd')}
          </Button>
          <Button
            size='sm'
            variant='destructive'
            disabled={isDeleting}
            onClick={onDeleteRequest}
            // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
            data-pw={`rule-delete-${rule.id}`}
          >
            {t('extracted.referralLinkValidations.validationRulesTable.delete_e2d0a549')}
          </Button>
        </div>
      </td>
    </tr>
  )
}
