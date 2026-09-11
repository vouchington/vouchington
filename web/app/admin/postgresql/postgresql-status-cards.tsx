'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { MigrationStatusResponse } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

export function PostgreSQLStatusCards({ status }: { status: MigrationStatusResponse | null }) {
  const t = useTranslations()
  return (
    <>
      <Card className='mb-6'>
        <CardHeader>
          <CardTitle data-pw='migration-status-title'>
            {t('extracted.postgresql.postgresqlStatusCards.migrationStatus_6da4a53d')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className='text-lg'>
            <span className='font-semibold text-emerald-600 dark:text-emerald-400'>
              {t('extracted.postgresql.postgresqlStatusCards.countApplied_7063e828', {
                count: status?.applied.length ?? 0,
              })}
            </span>
            {', '}
            <span className='font-semibold text-yellow-700'>
              {t('extracted.postgresql.postgresqlStatusCards.countPending_bc608dfb', {
                count: status?.pending.length ?? 0,
              })}
            </span>
          </p>
        </CardContent>
      </Card>

      {status && status.pending.length > 0 && (
        <Card className='mb-6'>
          <CardHeader>
            <CardTitle>
              {t('extracted.postgresql.postgresqlStatusCards.pendingMigrations_b7857706')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className='space-y-1'>
              {status.pending.map(name => (
                <li
                  key={name}
                  className='text-sm font-mono text-foreground'
                >
                  {name}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  )
}
