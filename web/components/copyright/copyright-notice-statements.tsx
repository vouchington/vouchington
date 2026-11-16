import { formatUtcDateTime } from '@ts-shared/utils/format'
import type { CopyrightParticipantNoticeDetail } from '@/types/copyright-notices'

export function CopyrightNoticeStatements({
  statements,
  uiLocale,
}: {
  statements: CopyrightParticipantNoticeDetail['statements']
  uiLocale: string
}) {
  if (statements.length === 0) return null
  return (
    <section className='space-y-3'>
      <h2 className='text-lg font-semibold'>Statements of reasons and decisions</h2>
      {statements.map(statement => (
        <article
          key={statement.id}
          className='rounded border p-3'
        >
          <p className='text-sm text-muted-foreground'>
            {statement.state === 'failed'
              ? 'Delivery failed'
              : statement.state === 'bounced'
                ? 'Delivery could not be completed'
                : statement.sent_at
                  ? `Sent ${formatUtcDateTime(statement.sent_at, uiLocale)}`
                  : 'Delivery pending'}
            {statement.sent_at && (statement.state === 'failed' || statement.state === 'bounced')
              ? ` · Sent ${formatUtcDateTime(statement.sent_at, uiLocale)}`
              : null}
          </p>
          <p className='whitespace-pre-wrap'>{statement.text}</p>
        </article>
      ))}
    </section>
  )
}
