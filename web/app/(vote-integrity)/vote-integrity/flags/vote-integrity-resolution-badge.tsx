'use client'

import { useTranslations } from '@/lib/i18n/use-translations'

type Resolution = 'dismissed' | 'penalized' | 'suspended'

interface Props {
  resolution: Resolution
}

const RESOLUTION_STYLES: Record<Resolution, string> = {
  dismissed: 'bg-gray-100 text-gray-700',
  penalized: 'bg-orange-100 text-orange-800',
  suspended: 'bg-red-100 text-red-800',
}

export function ResolutionBadge({ resolution }: Props) {
  const t = useTranslations()
  const style = RESOLUTION_STYLES[resolution]
  const label =
    resolution === 'dismissed'
      ? t('extracted.flags.integrityActions.dismissed_8b3ef40a')
      : resolution === 'penalized'
        ? t('extracted.flags.integrityActions.penalized_43ef99a1')
        : t('extracted.flags.integrityActions.suspended_81e27ab2')
  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${style}`}>{label}</span>
}
