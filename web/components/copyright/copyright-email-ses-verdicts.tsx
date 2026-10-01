import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import type { CopyrightEmailSesVerdicts as SesVerdicts } from '@/lib/api/client/copyright-email-intakes'
import { sesFailureNotes, sesVerdictRows } from './copyright-email-ses-verdicts-model'

/**
 * What Amazon SES recorded when it received the email. These are risk notes for staff, never a
 * decision: nothing here rejects or approves a notice.
 */
export function CopyrightEmailSesVerdicts({ verdicts }: { verdicts: SesVerdicts }) {
  const notes = sesFailureNotes(verdicts)
  return (
    <section
      aria-label='Email authentication and scan results'
      className='space-y-2'
    >
      <h3 className='font-medium'>Email authentication and scan results</h3>
      <dl className='flex flex-wrap gap-x-4 gap-y-1 text-sm'>
        {sesVerdictRows(verdicts).map(row => (
          <div
            className='flex items-center gap-1'
            key={row.key}
          >
            <dt className='text-muted-foreground'>{row.label}</dt>
            <dd>
              <Badge variant={row.verdict === 'fail' ? 'destructive' : 'secondary'}>
                {row.verdictLabel}
              </Badge>
            </dd>
          </div>
        ))}
      </dl>
      {notes.length > 0 && (
        <Alert
          aria-label='Authentication risk'
          role='note'
        >
          <AlertTitle>Authentication risk</AlertTitle>
          <AlertDescription>
            <ul className='list-disc space-y-1 pl-4'>
              {notes.map(note => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <p className='mt-2'>
              These are risk notes, not a decision. A legitimate sender can fail them through a
              forwarder or mailing list, so weigh them with the rest of the evidence.
            </p>
          </AlertDescription>
        </Alert>
      )}
      <p className='text-xs text-muted-foreground'>
        DKIM Pass means a signature validated. It does not show the signing domain matches the From
        address.
      </p>
    </section>
  )
}
