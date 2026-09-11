import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SpeculationRulesScript } from '@/components/seo/speculation-rules-script'
import { StructuredDataScript } from '@/components/seo/structured-data-script'

const meta = {
  title: 'Design System/SEO',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const StructuredDataScriptDefault: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <p className='text-sm text-muted-foreground'>
        StructuredDataScript renders a JSON-LD script tag.
      </p>
      <StructuredDataScript
        data={{
          '@context': 'https://schema.org',
          '@type': 'Thing',
          name: 'Voucha',
        }}
      />
    </main>
  ),
}

export const SpeculationRulesScriptDefault: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <p className='text-sm text-muted-foreground'>
        SpeculationRulesScript renders conservative anonymous prefetch rules.
      </p>
      <SpeculationRulesScript nonce='storybook-nonce' />
    </main>
  ),
}
