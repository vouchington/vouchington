import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { CopyrightEmailSesVerdict } from '@/lib/api/client/copyright-email-intakes'
import { availableOriginalUrl, sesVerdictLabel } from './copyright-email-ses-verdicts-model'
import { TextLink } from '@/components/ui/text-link'

/** Staff may download the original only after SES reports a passing virus verdict. */
export function CopyrightEmailOriginalDownload({
  downloadUrl,
  virus,
}: {
  downloadUrl: string | null
  virus: CopyrightEmailSesVerdict
}) {
  const originalUrl = availableOriginalUrl(downloadUrl, virus)
  if (originalUrl === null) {
    return (
      <Alert
        aria-label='Original email withheld'
        variant='destructive'
      >
        <AlertTitle>Original email withheld</AlertTitle>
        <AlertDescription>
          {virus === 'fail'
            ? 'SES reported malware in this message. The original email and its attachments are not available for download.'
            : virus === 'pass'
              ? 'The original email is not available for download.'
              : `The original email is unavailable because SES has not cleared its malware scan (malware scan: ${sesVerdictLabel(virus)}).`}
          {' Review the parsed text only.'}
        </AlertDescription>
      </Alert>
    )
  }
  return (
    <Button
      asChild
      variant='outline'
    >
      <TextLink
        data-pw='copyright-email-original-download'
        download
        href={originalUrl}
      >
        Download original email and attachments
      </TextLink>
    </Button>
  )
}
