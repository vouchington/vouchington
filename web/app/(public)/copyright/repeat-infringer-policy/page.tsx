import Link from 'next/link'

export const dynamic = 'force-dynamic'
export default function RepeatInfringerPolicyPage() {
  return (
    <main className='mx-auto max-w-3xl space-y-4 py-8'>
      <h1 className='text-3xl font-bold'>Repeat-infringer policy</h1>
      <p>
        This policy is not in effect. Copyright intake stays off until the program is activated. The
        policy below applies once the program is active.
      </p>
      <p>
        Voucha may terminate, in appropriate circumstances, the account of a member who repeatedly
        infringes copyright.
      </p>
      <h2 className='text-xl font-semibold'>Counting incidents</h2>
      <ul className='list-disc space-y-1 pl-5'>
        <li>
          A copyright incident counts against an account when a copyright moderator confirms a
          restriction on that account&apos;s post, including on appeal.
        </li>
        <li>Confirmed restrictions from one notice count as one incident.</li>
        <li>
          An incident stops counting when a copyright moderator reverses every confirmed restriction
          behind it or records that the notice was withdrawn, a duplicate, or abusive.
        </li>
        <li>Restoring material after a counter-notice does not remove an incident.</li>
      </ul>
      <h2 className='text-xl font-semibold'>Review and termination</h2>
      <ul className='list-disc space-y-1 pl-5'>
        <li>
          An account&apos;s second counting incident opens a staff review. Opening that review does
          not suspend the account.
        </li>
        <li>A copyright moderator may close the review with a warning or no action.</li>
        <li>
          Only an administrator may restrict or terminate the account, and only while it has at
          least two counting incidents.
        </li>
        <li>
          Restricting or terminating suspends the account. A terminated account stays suspended
          until an administrator records a reinstatement and lifts the suspension.
        </li>
        <li>An allegation or a count of notices alone never suspends or terminates an account.</li>
      </ul>
      <p>
        A case records an allegation and a staff outcome. It does not call a member an infringer.
        The same policy appears in Section 10 of the{' '}
        <Link
          className='underline'
          href='/article/terms-of-service'
        >
          Terms of Service
        </Link>
        . Read the{' '}
        <Link
          className='underline'
          href='/copyright'
        >
          copyright policy
        </Link>
        .
      </p>
    </main>
  )
}
