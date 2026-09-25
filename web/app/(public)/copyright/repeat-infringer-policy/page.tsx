export const dynamic = 'force-dynamic'
export default function RepeatInfringerPolicyPage() {
  return (
    <main className='mx-auto max-w-3xl space-y-4 py-8'>
      <h1 className='text-3xl font-bold'>Repeat-infringer policy</h1>
      <p>
        This policy is not in effect. Copyright intake stays off until the program is activated.
      </p>
      <p>When the program is active, staff weigh these factors before any decision about access:</p>
      <ul className='list-disc space-y-1 pl-5'>
        <li>A person confirmed the notice.</li>
        <li>A later confirmed notice names the same account.</li>
        <li>Counter-notices on that material.</li>
        <li>Court or Copyright Claims Board filings on that material.</li>
        <li>A separate staff decision. A notice count does not suspend or delete an account.</li>
      </ul>
      <p>
        A case records an allegation and a staff outcome. It does not call a member an infringer.
        Retention periods are not set here. They stay with the approved policy. Read the{' '}
        <a
          className='underline'
          href='/copyright'
        >
          copyright policy
        </a>
        .
      </p>
    </main>
  )
}
