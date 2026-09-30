'use client'

import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { AdminTableShell } from '@/components/admin/admin-table-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type QueueCatalogCells = {
  detail: string
  queueName: string
  subtitle: string
  title: string
}

type QueueCatalogLabels = {
  action: string
  detail: string
  heading: string
  idle: string
  loading: string
  middle: string
  queue: string
}

export function QueueCatalogTable<Row extends { id: string }>({
  actionLoading,
  labels,
  onActivate,
  renderTable,
  rows,
  toCells,
}: {
  actionLoading: Record<string, boolean>
  labels: QueueCatalogLabels
  onActivate: (row: Row) => void
  renderTable: (contents: ReactNode) => ReactNode
  rows: readonly Row[]
  toCells: (row: Row) => QueueCatalogCells
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.heading}</CardTitle>
      </CardHeader>
      <CardContent className='p-0'>
        <AdminTableShell
          aria-label={labels.heading}
          className='rounded-none border-0 shadow-none'
        >
          {renderTable(
            <>
              <thead>
                <tr className='border-b bg-muted/50'>
                  <th
                    scope='col'
                    className='px-4 py-3 text-left font-medium text-muted-foreground'
                  >
                    {labels.queue}
                  </th>
                  <th
                    scope='col'
                    className='px-4 py-3 text-left font-medium text-muted-foreground'
                  >
                    {labels.middle}
                  </th>
                  <th
                    scope='col'
                    className='px-4 py-3 text-left font-medium text-muted-foreground'
                  >
                    {labels.detail}
                  </th>
                  <th
                    scope='col'
                    className='px-4 py-3 text-left font-medium text-muted-foreground'
                  >
                    {labels.action}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const cells = toCells(row)
                  const busy = Boolean(actionLoading[row.id])
                  return (
                    <tr
                      key={row.id}
                      className='border-b last:border-0 hover:bg-muted/50'
                    >
                      <td className='px-4 py-3 font-mono text-xs text-muted-foreground'>
                        {cells.queueName}
                      </td>
                      <td className='px-4 py-3'>
                        <div className='font-medium'>{cells.title}</div>
                        <div className='font-mono text-xs text-muted-foreground'>
                          {cells.subtitle}
                        </div>
                      </td>
                      <td className='px-4 py-3 font-mono text-xs text-muted-foreground'>
                        {cells.detail}
                      </td>
                      <td className='px-4 py-3'>
                        <Button
                          variant='outline'
                          size='touchSm'
                          disabled={busy}
                          onClick={() => onActivate(row)}
                        >
                          {busy ? (
                            <span className='flex items-center gap-2'>
                              <Loader2 className='h-3 w-3 animate-spin' />
                              {labels.loading}
                            </span>
                          ) : (
                            labels.idle
                          )}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </>,
          )}
        </AdminTableShell>
      </CardContent>
    </Card>
  )
}
