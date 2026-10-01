import type { ReactNode } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { CopyrightEmailIntake } from '@/lib/api/client/copyright-email-intakes'

type ParsedEmail = NonNullable<CopyrightEmailIntake['parsed_email']>

function Text({ children }: { children: string }): ReactNode {
  return children === '' ? <span className='text-muted-foreground'>(empty)</span> : children
}

/**
 * The sender, subject, and body of the parsed email, and the parser's error when the parse failed.
 *
 * All of it is untrusted claimant input. Render it only as React text nodes: never
 * `dangerouslySetInnerHTML`, markdown, or linkified text. The body is preformatted so its real
 * newlines show; the structured fields are labelled values, never a JSON dump.
 */
export function CopyrightEmailParsedEmail({
  parsedEmail,
  parserError,
  originalAvailable,
}: {
  parsedEmail: ParsedEmail | null
  parserError: string | null
  // False when SES quarantined the original, so there is nothing to point staff at.
  originalAvailable: boolean
}) {
  return (
    <section
      aria-label='Parsed email'
      className='space-y-2'
    >
      <h3 className='font-medium'>Parsed email</h3>
      {parsedEmail ? (
        <dl className='space-y-2 text-sm'>
          <div>
            <dt className='text-muted-foreground'>From</dt>
            <dd className='break-words'>
              <Text>{parsedEmail.sender_email}</Text>
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground'>Subject</dt>
            <dd className='break-words'>
              <Text>{parsedEmail.subject}</Text>
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground'>Body</dt>
            <dd>
              {parsedEmail.body_text === '' ? (
                <Text>{parsedEmail.body_text}</Text>
              ) : (
                <pre className='overflow-auto whitespace-pre-wrap break-words rounded border p-3 text-xs'>
                  {parsedEmail.body_text}
                </pre>
              )}
            </dd>
          </div>
        </dl>
      ) : (
        <>
          {parserError === null ? (
            <p className='text-sm text-muted-foreground'>No parsed email</p>
          ) : (
            <Alert
              aria-label='Parse failed'
              variant='destructive'
            >
              <AlertDescription>
                <p className='whitespace-pre-wrap break-words'>Parse failed: {parserError}</p>
              </AlertDescription>
            </Alert>
          )}
          {originalAvailable && (
            <p className='text-sm text-muted-foreground'>
              Download the original email above and enter the statutory fields by hand.
            </p>
          )}
        </>
      )}
    </section>
  )
}
