import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { CopyrightEmailSesVerdict } from '@/lib/api/client/copyright-email-intakes'
import { sesMalwareState, sesVerdictLabel } from './copyright-email-ses-verdicts-model'

/**
 * The staff link to the raw `.eml`. SES reporting malware (`fail`) withholds the link and says why;
 * a scan SES could not complete still offers it, with a warning to open it only in isolation.
 */
export function CopyrightEmailOriginalDownload({
  downloadUrl,
  virus,
}: {
  downloadUrl: string | null
  virus: CopyrightEmailSesVerdict
}) {
  const state = sesMalwareState(virus)
  if (state === 'quarantined' || downloadUrl === null) {
    return (
      <Alert
        data-pw='copyright-email-quarantined'
        variant='destructive'
      >
        <AlertTitle>Original email withheld</AlertTitle>
        <AlertDescription>
          SES reported malware in this message, so the original email and its attachments are not
          available for download. Review the parsed text only.
        </AlertDescription>
      </Alert>
    )
  }
  return (
    <div className='space-y-2'>
      {state === 'unconfirmed' && (
        <Alert
          data-pw='copyright-email-malware-unconfirmed'
          role='note'
        >
          <AlertTitle>Malware scan not confirmed</AlertTitle>
          <AlertDescription>
            {`SES did not confirm this message is free of malware (malware scan: ${sesVerdictLabel(virus)}). Download the original only if the parsed text is not enough, and open it in an isolated environment.`}
          </AlertDescription>
        </Alert>
      )}
      <Button
        asChild
        variant='outline'
      >
        <a href={downloadUrl}>Download original email and attachments</a>
      </Button>
    </div>
  )
}
