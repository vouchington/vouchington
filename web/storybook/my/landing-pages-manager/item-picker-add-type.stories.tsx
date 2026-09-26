import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  AddTypeSelect,
  LinkFields,
} from '@/components/my/landing-pages-manager/item-picker-add-type'
import type { LandingPageAddType } from '@/components/my/landing-pages-manager/options'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'My/Add Type Select',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function LinkDraft({
  addType,
  label,
  url,
}: {
  addType: LandingPageAddType
  label: string
  url: string
}) {
  const [type, setType] = useState(addType)
  const [linkLabel, setLinkLabel] = useState(label)
  const [linkUrl, setLinkUrl] = useState(url)
  return (
    <div className='space-y-4'>
      <AddTypeSelect
        addType={type}
        onAddTypeChange={setType}
      />
      <LinkFields
        linkLabel={linkLabel}
        linkUrl={linkUrl}
        setLinkLabel={setLinkLabel}
        setLinkUrl={setLinkUrl}
      />
    </div>
  )
}

export const AwardWalletLink: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <LinkDraft
        addType='link'
        label='Award wallet'
        url='https://wallet.example/cardholder'
      />
    </StoryFrame>
  ),
}

export const EmptyLink: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <LinkDraft
        addType='link'
        label=''
        url=''
      />
    </StoryFrame>
  ),
}
