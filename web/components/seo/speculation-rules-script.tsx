import { serializeSpeculationRules } from '@/lib/seo/navigation-performance'

interface SpeculationRulesScriptProps {
  nonce?: string
}

export function SpeculationRulesScript({ nonce }: SpeculationRulesScriptProps) {
  return (
    <script
      data-pw='navigation-speculation-rules-script'
      id='navigation-speculation-rules'
      type='speculationrules'
      nonce={nonce}
      suppressHydrationWarning
      // oxlint-disable-next-line react/no-danger -- speculation rules require inline JSON; serializer escapes < characters.
      dangerouslySetInnerHTML={{ __html: serializeSpeculationRules() }}
    />
  )
}
