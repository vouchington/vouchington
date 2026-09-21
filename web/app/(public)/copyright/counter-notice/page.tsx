import Link from 'next/link'
export const dynamic = 'force-dynamic'
export default function CounterNoticePage() {
  return (
    <main className='mx-auto max-w-3xl space-y-4 py-8'>
      <h1 className='text-3xl font-bold'>Counter-notice and restoration</h1>
      <p>
        If your hosted material was removed by mistake or misidentification, you may submit a
        statutory counter-notice after the program is active. It requires your contact information,
        a good-faith statement under penalty of perjury, consent to federal jurisdiction, consent to
        service of process, and an electronic signature.
      </p>
      <p>
        After a valid counter-notice is forwarded, restoration follows the statutory timing unless a
        qualifying court or Copyright Claims Board notice prevents it.
      </p>
      <Link
        className='underline'
        href='/copyright'
      >
        Copyright policy
      </Link>
    </main>
  )
}
