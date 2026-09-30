import Link from 'next/link'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

const MISREPRESENTATION = {
  notice: 'that material is infringing',
  counter_notice: 'that material was removed or disabled by mistake or misidentification',
} as const

const ADVICE = {
  notice:
    'Check whether the use could be fair use before you file, and talk to a lawyer if you are unsure.',
  counter_notice: 'Talk to a lawyer if you are unsure.',
} as const

export function CopyrightMisrepresentationWarning({
  kind,
}: {
  kind: keyof typeof MISREPRESENTATION
}) {
  return (
    <Alert
      role='note'
      data-pw='copyright-misrepresentation-warning'
    >
      <AlertTitle>False claims have legal consequences</AlertTitle>
      <AlertDescription>
        <p>
          Under 17 U.S.C. § 512(f), anyone who knowingly makes a material misrepresentation{' '}
          {MISREPRESENTATION[kind]} can be liable for damages, including costs and attorneys&apos;
          fees. {ADVICE[kind]}{' '}
          <Link
            className='underline'
            href='/article/copyright-complaints'
          >
            How copyright complaints work
          </Link>
        </p>
      </AlertDescription>
    </Alert>
  )
}
