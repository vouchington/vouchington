import type { CopyrightEmailIntake } from '@/lib/api/client/copyright-email-intakes'

/**
 * The advisory agent's recommendation, or an explicit empty state while none exists. The output is
 * agent text derived from untrusted email, so it renders only as a React text node.
 */
export function CopyrightEmailRecommendation({
  recommendation,
}: {
  recommendation: CopyrightEmailIntake['recommendation']
}) {
  return (
    <section
      aria-label='Agent recommendation'
      className='space-y-2'
    >
      <h3 className='font-medium'>Agent recommendation</h3>
      {recommendation ? (
        <pre className='overflow-auto rounded border p-3 text-xs'>
          {JSON.stringify(recommendation, null, 2)}
        </pre>
      ) : (
        <p className='text-sm text-muted-foreground'>No agent recommendation yet</p>
      )}
    </section>
  )
}
