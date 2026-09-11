'use client'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslations } from '@/lib/i18n/use-translations'

export type RuleType = 'block-non-referral' | 'valid' | 'blocked'

interface RuleTypeSelectProps {
  value: RuleType
  onValueChange: (value: RuleType) => void
}

export function RuleTypeSelect({ value, onValueChange }: RuleTypeSelectProps) {
  const t = useTranslations()
  return (
    <div className='space-y-2'>
      <Label htmlFor='rule-type'>
        {t('extracted.referralLinkValidations.validationRuleForm.ruleType_725b37e6')}
      </Label>
      <Select
        value={value}
        onValueChange={v => onValueChange(v as RuleType)}
      >
        <SelectTrigger
          id='rule-type'
          data-pw='rule-form-rule-type'
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='valid'>
            {t(
              'extracted.referralLinkValidations.validationRuleForm.validReferralLinkUrl_e25aeb34',
            )}
          </SelectItem>
          <SelectItem value='blocked'>
            {t(
              'extracted.referralLinkValidations.validationRuleForm.blockedReferralLinkUrl_0ce8a1f2',
            )}
          </SelectItem>
          <SelectItem value='block-non-referral'>
            {t('extracted.referralLinkValidations.validationRuleForm.blockNonReferralUrl_f12acf0b')}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
