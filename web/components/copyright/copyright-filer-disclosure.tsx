import Link from 'next/link'
import { userHref } from '@/lib/links/entity-href'
import type { ClientAuthUser } from '@/lib/auth/client-auth-user'

/** What the filer's identity looks like on an accepted case, by whether they are signed in. */
export function CopyrightFilerDisclosure({ currentUser }: { currentUser: ClientAuthUser | null }) {
  if (!currentUser)
    return (
      <p className='text-sm text-muted-foreground'>
        You are filing without signing in, so accepted notices show no profile for you. Your legal
        name, contact details, and signature stay private.
      </p>
    )
  return (
    <p className='text-sm text-muted-foreground'>
      Accepted notices show your current public profile to signed-in members. See your{' '}
      <Link
        className='underline'
        href={userHref(currentUser)}
      >
        profile
      </Link>
      . Your legal name, contact details, and signature stay private.
    </p>
  )
}
