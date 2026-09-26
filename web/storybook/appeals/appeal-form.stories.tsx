import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { AppealForm } from '@/components/appeals/appeal-form'
import { useTranslations } from '@/lib/i18n/use-translations'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Appeals/Appeal Form',
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function AppealPreview(props: {
  targetType: 'removal' | 'suspension'
  targetId?: string
  postRemovalKind?: 'platform'
}) {
  const t = useTranslations()
  const [submitted, setSubmitted] = useState(false)
  return (
    <StoryFrame width='max-w-lg'>
      {submitted ? (
        <p>{t('extracted.appeals.appealForm.appealSubmittedYouWillBeNotified_e79910fb')}</p>
      ) : (
        <AppealForm
          {...props}
          onSuccess={() => setSubmitted(true)}
        />
      )}
    </StoryFrame>
  )
}

export const PostRemoval: Story = {
  render: () => (
    <AppealPreview
      targetType='removal'
      targetId='post-review'
      postRemovalKind='platform'
    />
  ),
}

export const Suspension: Story = {
  render: () => <AppealPreview targetType='suspension' />,
}
