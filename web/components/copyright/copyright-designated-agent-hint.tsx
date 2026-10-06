import type { ReactNode } from 'react'
import Link from 'next/link'
import { Alert, AlertDescription } from '@/components/ui/alert'

const AGENT_PAGE = '/copyright/designated-agent'

/**
 * Whether Voucha has published a designated agent. None is published yet, so the notice form is the
 * only route claimants are pointed to and nobody is sent to email. Set this when the registration
 * and contact details are published on the designated-agent page.
 */
const DESIGNATED_AGENT_PUBLISHED = false

type AgentPublishedProps = { agentPublished?: boolean }

function DesignatedAgentLink({ children }: { children: ReactNode }) {
  return (
    <Link
      className='underline'
      href={AGENT_PAGE}
    >
      {children}
    </Link>
  )
}

/**
 * The route for a claimant who cannot open the image. It reads the same for every case, so it never
 * says why the claimant cannot open the image.
 */
export function CopyrightDesignatedAgentHint({
  agentPublished = DESIGNATED_AGENT_PUBLISHED,
}: AgentPublishedProps) {
  return (
    <p
      data-pw='copyright-designated-agent-hint'
      className='text-sm text-muted-foreground'
    >
      {agentPublished ? (
        <>
          If you cannot open the image yourself, email your notice to our{' '}
          <DesignatedAgentLink>designated agent</DesignatedAgentLink> instead.
        </>
      ) : (
        <>
          Use this form to file your notice. We have not published a designated agent yet. See the{' '}
          <DesignatedAgentLink>designated agent status</DesignatedAgentLink> page for updates.
        </>
      )}
    </p>
  )
}

/** Shown after every failed hosted-material lookup, whatever the reason. */
export function CopyrightTargetNotFound({
  agentPublished = DESIGNATED_AGENT_PUBLISHED,
}: AgentPublishedProps) {
  return (
    <Alert
      variant='destructive'
      data-pw='copyright-target-not-found'
    >
      <AlertDescription>
        {agentPublished ? (
          <>
            We could not find hosted material at that URL. Check the link and try again. If the link
            is right but you cannot open the image yourself, email your notice to our{' '}
            <DesignatedAgentLink>designated agent</DesignatedAgentLink> instead.
          </>
        ) : (
          <>
            We could not find hosted material at that URL. Check the link and try again. We have not
            published a designated agent yet. See the{' '}
            <DesignatedAgentLink>designated agent status</DesignatedAgentLink> page for updates.
          </>
        )}
      </AlertDescription>
    </Alert>
  )
}
