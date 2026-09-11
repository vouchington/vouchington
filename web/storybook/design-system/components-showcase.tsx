'use client'

import {
  BadgeShowcaseSection,
  ButtonShowcaseSection,
  CardShowcaseSection,
  FormShowcaseSection,
  TabsShowcaseSection,
} from './components-showcase-sections'
import { FeedbackShowcaseSection, OverlayShowcaseSection } from './components-showcase-overlays'

export function ComponentsShowcase() {
  return (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto flex max-w-5xl flex-col gap-8'>
        <ButtonShowcaseSection />
        <BadgeShowcaseSection />
        <CardShowcaseSection />
        <FormShowcaseSection />
        <TabsShowcaseSection />
        <OverlayShowcaseSection />
        <FeedbackShowcaseSection />
      </div>
    </main>
  )
}
