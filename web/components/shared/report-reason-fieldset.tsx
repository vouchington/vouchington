'use client'

import type { MessageKey } from '@ts-shared/ui-messages'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  REPORT_REASONS,
  type ReportableEntityType,
  type ReportReason,
} from '@/lib/api/client/reports'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  entityType: ReportableEntityType
  reason: ReportReason | null
  onSelect: (reason: ReportReason) => void
}

// Kebab-case test-id suffix per reason; combined with the `report-reason-` prefix below into the
// data-pw consumed by playwright/tests/reporting specs. The Record type guards exhaustiveness, and
// keeping the suffix as data avoids a function call inside data-pw (web-data-pw-simple).
const REPORT_REASON_PW_SUFFIX: Record<ReportReason, string> = {
  spam: 'spam',
  harassment: 'harassment',
  misinformation: 'misinformation',
  illegal_content: 'illegal-content',
  vote_manipulation: 'vote-manipulation',
  other: 'other',
}

// `getVisibleReportReasonOptions` returns options whose `.label` is the raw English string from
// `MODERATION_POLICY` (ts-shared/utils/moderation-policy-data.mts) — not translated. This Record
// maps each reason to its catalog key so the label can be rendered via `t()` instead.
const REPORT_REASON_LABEL_KEYS: Record<ReportReason, MessageKey> = {
  spam: 'extracted.shared.reportReasonFieldset.spam_94a9eac4',
  harassment: 'extracted.shared.reportReasonFieldset.harassment_98a7655d',
  misinformation: 'extracted.shared.reportReasonFieldset.misinformation_34d52e35',
  illegal_content: 'extracted.shared.reportReasonFieldset.illegalContent_641a0f48',
  vote_manipulation: 'extracted.shared.reportReasonFieldset.voteManipulation_6612069f',
  other: 'extracted.shared.reportReasonFieldset.other_f97e9da0',
}

export function ReportReasonFieldset({ entityType, reason, onSelect }: Props) {
  const t = useTranslations()
  return (
    <div className='space-y-2'>
      <p className='text-sm font-medium'>
        {t('extracted.shared.reportReasonFieldset.reason_f81ab834')}
      </p>
      <RadioGroup
        aria-label={t('extracted.shared.reportReasonFieldset.reason_f81ab834')}
        value={reason ?? ''}
        onValueChange={(value: string) => onSelect(value as ReportReason)}
        className='gap-1'
      >
        {getVisibleReportReasonOptions(entityType).map(option => {
          const id = `report-reason-input-${option.value}`
          return (
            <Label
              key={option.value}
              htmlFor={id}
              className='flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm font-normal hover:bg-accent'
            >
              <RadioGroupItem
                id={id}
                value={option.value}
                // oxlint-disable-next-line no-mistakes/playwright-literals -- single-interpolation kebab id; consumed by playwright/tests/reporting specs
                data-pw={`report-reason-${REPORT_REASON_PW_SUFFIX[option.value]}`}
              />
              {t(REPORT_REASON_LABEL_KEYS[option.value])}
            </Label>
          )
        })}
      </RadioGroup>
    </div>
  )
}

function getVisibleReportReasonOptions(entityType: ReportableEntityType) {
  return REPORT_REASONS.filter(
    option => option.value !== 'vote_manipulation' || entityType === 'post',
  )
}
