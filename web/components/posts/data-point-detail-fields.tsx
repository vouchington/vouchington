import type { ReactNode } from 'react'

export function DataPointRow({
  label,
  value,
  children,
  'data-pw': dataPw = 'data-point-row',
}: {
  label: string
  value?: ReactNode
  children?: ReactNode
  'data-pw'?: string
}) {
  return (
    <div
      className='flex justify-between gap-2 py-1 text-sm'
      data-pw={dataPw}
    >
      <span className='text-muted-foreground shrink-0'>{label}</span>
      <span className='font-medium text-right'>{children === undefined ? value : children}</span>
    </div>
  )
}

export function DataPointResultBadge({
  result,
  label,
  'data-pw': dataPw = 'data-point-result-badge',
}: {
  result: string
  label: string
  'data-pw'?: string
}) {
  const isPositive = result === 'approved' || result === 'sign_up_bonus' || result === 'offer'
  const isNegative = result === 'denied'
  return (
    <span
      className={[
        'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium',
        isPositive ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : '',
        isNegative ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : '',
        !isPositive && !isNegative ? 'bg-muted text-muted-foreground' : '',
      ].join(' ')}
      data-pw={dataPw}
    >
      {label}
    </span>
  )
}
