import type { Translator } from '@ts-shared/ui-messages'

interface CompareStatRowProps {
  label: string
  valueA: string
  valueB: string
  topicAName: string
  topicBName: string
  t: Translator
}

export function CompareStatRow({
  label,
  valueA,
  valueB,
  topicAName,
  topicBName,
  t,
}: CompareStatRowProps) {
  return (
    <div className='flex items-center border-b p-2 last:border-b-0 sm:p-3'>
      <div className='w-1/3 text-sm text-muted-foreground'>{label}</div>
      <div className='flex w-2/3'>
        <div className='w-1/2 text-center'>
          <span className='sr-only'>
            {t('extracted.compare.compareStatRow.name_8b736e0d', { name: topicAName })}{' '}
          </span>
          <span className='text-sm font-medium'>{valueA}</span>
        </div>
        <div className='w-1/2 text-center'>
          <span className='sr-only'>
            {t('extracted.compare.compareStatRow.name_8b736e0d', { name: topicBName })}{' '}
          </span>
          <span className='text-sm font-medium'>{valueB}</span>
        </div>
      </div>
    </div>
  )
}
