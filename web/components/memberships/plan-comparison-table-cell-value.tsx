import { Check, X } from 'lucide-react'
import type { Translator } from '@ts-shared/ui-messages'

export function CellValue({ value, t }: { value: string | boolean; t: Translator }) {
  if (typeof value !== 'boolean') return <span>{value}</span>
  return value ? (
    <Check
      className='mx-auto h-4 w-4 text-emerald-600'
      aria-label={t('extracted.memberships.planComparisonTable.included_ba829a98')}
    />
  ) : (
    <X
      className='mx-auto h-4 w-4 text-muted-foreground'
      aria-label={t('extracted.memberships.planComparisonTable.notIncluded_b665bfc2')}
    />
  )
}
