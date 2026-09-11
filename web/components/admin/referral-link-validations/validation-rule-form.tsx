'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  createReferralLinkValidationRule,
  updateReferralLinkValidationRule,
  type ReferralLinkValidationRule,
} from '@/lib/api/client/referral-link-validations'
import onError, { onSuccess } from '@/lib/on-error'
import { useTranslations } from '@/lib/i18n/use-translations'
import { RuleTypeSelect, type RuleType } from './rule-type-select'

interface ValidationRuleFormProps {
  validationId: string
  existing?: ReferralLinkValidationRule | null
  onSaved?: (rule: ReferralLinkValidationRule) => void
  onCancel?: () => void
}

export function ValidationRuleForm({
  validationId,
  existing,
  onSaved,
  onCancel,
}: ValidationRuleFormProps) {
  const t = useTranslations()
  const [hostname, setHostname] = useState(existing?.hostname ?? '')
  const [pathname, setPathname] = useState(existing?.pathname ?? '')
  const [ruleType, setRuleType] = useState<RuleType>(() => {
    if (existing?.is_invalid_referral_link_url) return 'blocked'
    if (existing?.is_referral_link_url) return 'valid'
    return 'block-non-referral'
  })
  const [userErrorText, setUserErrorText] = useState(existing?.user_error_text ?? '')
  const [exampleUrlsText, setExampleUrlsText] = useState(() =>
    (existing?.example_urls ?? []).join('\n'),
  )
  const [saving, setSaving] = useState(false)

  function parseExampleUrls(text: string): string[] | null {
    const urls = text.split('\n').flatMap(s => (s.trim() ? [s.trim()] : []))
    return urls.length > 0 ? urls : null
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!hostname.trim() || !pathname.trim()) return

    setSaving(true)

    const data = {
      hostname: hostname.trim(),
      pathname: pathname.trim(),
      is_referral_link_url: ruleType === 'valid' || ruleType === 'blocked',
      is_invalid_referral_link_url: ruleType === 'blocked',
      user_error_text: userErrorText.trim() || null,
      example_urls: parseExampleUrls(exampleUrlsText),
    }

    try {
      let result: { validation_rule: ReferralLinkValidationRule }
      if (existing) {
        result = await updateReferralLinkValidationRule(validationId, existing.id, data)
        onSuccess(t('extracted.referralLinkValidations.validationRuleForm.ruleUpdated_cb3de6df'))
      } else {
        result = await createReferralLinkValidationRule(validationId, data)
        onSuccess(t('extracted.referralLinkValidations.validationRuleForm.ruleCreated_1d0e14f1'))
      }
      setSaving(false)
      onSaved?.(result.validation_rule)
    } catch (error) {
      onError(error, {
        fallback: t(
          'extracted.referralLinkValidations.validationRuleForm.failedToSaveRule_bf356f1f',
        ),
      })
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className='space-y-4'
    >
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
        <div className='space-y-2'>
          <Label htmlFor='rule-hostname'>
            {t('extracted.referralLinkValidations.validationRuleForm.hostname_2db53355')}
          </Label>
          <Input
            id='rule-hostname'
            type='text'
            placeholder={t(
              'extracted.referralLinkValidations.validationRuleForm.eGReferChaseCom_355017cb',
            )}
            value={hostname}
            onChange={e => setHostname(e.target.value)}
            required
            data-pw='rule-form-hostname'
          />
        </div>
        <div className='space-y-2'>
          <Label htmlFor='rule-pathname'>
            {t('extracted.referralLinkValidations.validationRuleForm.pathnameSqlLike_a234b007')}
          </Label>
          <Input
            id='rule-pathname'
            type='text'
            placeholder={t('extracted.referralLinkValidations.validationRuleForm.eGRefer_46e0030b')}
            value={pathname}
            onChange={e => setPathname(e.target.value)}
            required
            data-pw='rule-form-pathname'
          />
        </div>
      </div>
      <RuleTypeSelect
        value={ruleType}
        onValueChange={setRuleType}
      />
      <div className='space-y-2'>
        <Label htmlFor='rule-user-error-text'>
          {t('extracted.referralLinkValidations.validationRuleForm.userErrorText_08a2668f')}
        </Label>
        <Input
          id='rule-user-error-text'
          type='text'
          placeholder={t(
            'extracted.referralLinkValidations.validationRuleForm.shownWhenUrlFailsValidation_a110a593',
          )}
          value={userErrorText}
          onChange={e => setUserErrorText(e.target.value)}
          data-pw='rule-form-user-error-text'
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='rule-example-urls'>
          {t('extracted.referralLinkValidations.validationRuleForm.exampleUrlsOnePerLine_2541faba')}
        </Label>
        <Textarea
          id='rule-example-urls'
          placeholder={t(
            'extracted.referralLinkValidations.validationRuleForm.httpsReferChaseComReferRef_f00f3e03',
          )}
          value={exampleUrlsText}
          onChange={e => setExampleUrlsText(e.target.value)}
          rows={3}
          data-pw='rule-form-example-urls'
        />
      </div>
      <div className='flex gap-2'>
        <Button
          type='submit'
          loading={saving}
          disabled={
            saving ||
            !hostname.trim() ||
            !pathname.trim() ||
            (ruleType !== 'valid' && !userErrorText.trim())
          }
          data-pw='rule-form-submit'
        >
          {saving
            ? t('extracted.referralLinkValidations.validationRuleForm.saving_dc85af8f')
            : existing
              ? t('extracted.referralLinkValidations.validationRuleForm.update_c1c1009d')
              : t('extracted.referralLinkValidations.validationRuleForm.addRule_968c3cb8')}
        </Button>
        {onCancel && (
          <Button
            type='button'
            variant='outline'
            onClick={onCancel}
            data-pw='rule-form-cancel'
          >
            {t('extracted.referralLinkValidations.validationRuleForm.cancel_19766ed6')}
          </Button>
        )}
      </div>
    </form>
  )
}
