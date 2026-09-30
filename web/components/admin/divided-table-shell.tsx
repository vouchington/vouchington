import type { ReactNode } from 'react'
import { AdminTableShell } from '@/components/admin/admin-table-shell'

export type DividedTableColumn = readonly [id: string, label: string]

interface DividedTableShellProps {
  'aria-label': string
  children: ReactNode
  columns: readonly DividedTableColumn[]
  emptyMessage: string
  isEmpty: boolean
}

export function DividedTableShell({
  'aria-label': ariaLabel,
  children,
  columns,
  emptyMessage,
  isEmpty,
}: DividedTableShellProps) {
  return (
    <AdminTableShell
      aria-label={ariaLabel}
      emptyMessage={emptyMessage}
      isEmpty={isEmpty}
    >
      <table className='min-w-full divide-y divide-border'>
        <thead className='bg-muted/50'>
          <tr>
            {columns.map(([id, label]) => (
              <th
                key={id}
                className='px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground'
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className='divide-y divide-border bg-card'>{children}</tbody>
      </table>
    </AdminTableShell>
  )
}
