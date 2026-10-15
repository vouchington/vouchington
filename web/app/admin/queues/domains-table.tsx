'use client'

import { AdminTableShell } from '@/components/admin/admin-table-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { QueueDomain } from '@/lib/api/client/mq'
import { DomainActions, type DomainAction } from './domain-actions'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { DOMAIN_COUNT_STATES, formatDomainCount, type DomainCountState } from './domains-model'

export type DomainsTableLabels = {
  action: string
  counts: Record<DomainCountState, string>
  domain: string
  heading: string
  pause: string
  paused: (reason: string | null) => string
  resume: string
  retryFailed: string
  running: string
  status: string
}

const HEADER_CLASS = 'px-4 py-3 text-left font-medium text-muted-foreground'

export function DomainsTable({
  busy,
  domains,
  labels,
  onAction,
}: {
  busy: Record<string, boolean>
  domains: readonly QueueDomain[]
  labels: DomainsTableLabels
  onAction: (domain: QueueDomain, action: DomainAction) => void
}) {
  const locale = useUiLocale()
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
          <table
            data-pw='queue-domains-table'
            className='w-full text-sm'
          >
            <thead>
              <tr className='border-b bg-muted/50'>
                <th
                  scope='col'
                  className={HEADER_CLASS}
                >
                  {labels.domain}
                </th>
                <th
                  scope='col'
                  className={HEADER_CLASS}
                >
                  {labels.status}
                </th>
                {DOMAIN_COUNT_STATES.map(state => (
                  <th
                    key={state}
                    scope='col'
                    className={HEADER_CLASS}
                  >
                    {labels.counts[state]}
                  </th>
                ))}
                <th
                  scope='col'
                  className={HEADER_CLASS}
                >
                  {labels.action}
                </th>
              </tr>
            </thead>
            <tbody>
              {domains.map(domain => (
                <tr
                  key={domain.domain}
                  data-pw='queue-domain-row'
                  className='border-b last:border-0 hover:bg-muted/50'
                >
                  <td className='px-4 py-3 font-mono text-xs'>{domain.domain}</td>
                  <td
                    data-pw='queue-domain-status'
                    className='px-4 py-3'
                  >
                    {domain.paused ? labels.paused(domain.reason) : labels.running}
                  </td>
                  <td
                    data-pw='queue-domain-waiting'
                    className='px-4 py-3 tabular-nums'
                  >
                    {formatDomainCount(domain.waiting, locale)}
                  </td>
                  <td
                    data-pw='queue-domain-active'
                    className='px-4 py-3 tabular-nums'
                  >
                    {formatDomainCount(domain.active, locale)}
                  </td>
                  <td
                    data-pw='queue-domain-delayed'
                    className='px-4 py-3 tabular-nums'
                  >
                    {formatDomainCount(domain.delayed, locale)}
                  </td>
                  <td
                    data-pw='queue-domain-completed'
                    className='px-4 py-3 tabular-nums'
                  >
                    {formatDomainCount(domain.completed, locale)}
                  </td>
                  <td
                    data-pw='queue-domain-failed'
                    className='px-4 py-3 tabular-nums'
                  >
                    {formatDomainCount(domain.failed, locale)}
                  </td>
                  <td className='px-4 py-3'>
                    <DomainActions
                      busy={Boolean(busy[domain.domain])}
                      domain={domain}
                      labels={labels}
                      onAction={onAction}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableShell>
      </CardContent>
    </Card>
  )
}
