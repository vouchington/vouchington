import type { Translator } from '@ts-shared/ui-messages'
import { getPlanFaqItems } from './plan-faq-items'
import { ChevronDown } from 'lucide-react'

export function PlanFAQ({ t }: { t: Translator }) {
  return (
    <section aria-labelledby='faq-heading'>
      <h2
        id='faq-heading'
        data-pw='plan-faq-heading'
        className='mb-4 text-xl font-bold sm:text-2xl'
      >
        {t('extracted.memberships.planFaq.frequentlyAskedQuestions_a3d458e1')}
      </h2>
      <div className='w-full rounded-lg border'>
        {getPlanFaqItems(t).map(({ question, answer }) => (
          <details
            key={question}
            className='group border-b px-4 last:border-b-0'
          >
            <summary className='flex cursor-pointer list-none items-center justify-between py-4 text-left text-sm font-medium transition-all hover:underline [&::-webkit-details-marker]:hidden'>
              {question}
              <ChevronDown
                aria-hidden='true'
                className='size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180'
              />
            </summary>
            <p className='pb-4 pt-0 text-sm text-muted-foreground'>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
