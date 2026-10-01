import Link from 'next/link'
import { Alert, AlertDescription } from '@/components/ui/alert'

const AGENT_PAGE = '/copyright/designated-agent'

function DesignatedAgentLink() {
  return (
    <Link
      className='underline'
      href={AGENT_PAGE}
    >
      designated agent
    </Link>
  )
}

/**
 * The email path for a claimant who cannot open the image. It reads the same for every case, so it
 * never says why the claimant cannot open the image.
 */
export function CopyrightDesignatedAgentHint() {
  return (
    <p
      data-pw='copyright-designated-agent-hint'
      className='text-sm text-muted-foreground'
    >
      If you cannot open the image yourself, email your notice to our <DesignatedAgentLink />{' '}
      instead.
    </p>
  )
}

/** Shown after every failed hosted-material lookup, whatever the reason. */
export function CopyrightTargetNotFound() {
  return (
    <Alert
      variant='destructive'
      data-pw='copyright-target-not-found'
    >
      <AlertDescription>
        We could not find hosted material at that URL. Check the link and try again. If the link is
        right but you cannot open the image yourself, email your notice to our{' '}
        <DesignatedAgentLink /> instead.
      </AlertDescription>
    </Alert>
  )
}
