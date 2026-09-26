import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CreatePageForm, PageDetailsForm } from '@/components/my/landing-pages-manager/page-forms'
import { StoryFrame } from '@/storybook/story-frame'
import { landingPageWithItems } from '@/storybook/entities/fixtures/landing'

const meta = {
  title: 'My/Create Page Form',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function CreateDraft({ title, slug, subtitle }: { title: string; slug: string; subtitle: string }) {
  const [pageTitle, setPageTitle] = useState(title)
  const [pageSlug, setPageSlug] = useState(slug)
  const [pageSubtitle, setPageSubtitle] = useState(subtitle)
  return (
    <CreatePageForm
      loading={false}
      newTitle={pageTitle}
      newSlug={pageSlug}
      newSubtitle={pageSubtitle}
      onSubmit={event => event.preventDefault()}
      setNewTitle={setPageTitle}
      setNewSlug={setPageSlug}
      setNewSubtitle={setPageSubtitle}
    />
  )
}

function DetailsDraft() {
  const travelPage = {
    ...landingPageWithItems,
    id: 'landing-page-travel',
    title: 'Travel redemptions',
    slug: 'travel',
    is_default: false,
    subtitle: 'Flights and hotels I book with points.',
  }
  const [title, setTitle] = useState(travelPage.title)
  const [slug, setSlug] = useState(travelPage.slug)
  const [subtitle, setSubtitle] = useState(travelPage.subtitle ?? '')
  return (
    <PageDetailsForm
      loading={false}
      selectedPage={travelPage}
      title={title}
      slug={slug}
      subtitle={subtitle}
      onSubmit={event => event.preventDefault()}
      onSetDefault={() => {}}
      onDelete={() => {}}
      setTitle={setTitle}
      setSlug={setSlug}
      setSubtitle={setSubtitle}
    />
  )
}

export const NewTravelPage: Story = {
  render: () => (
    <StoryFrame>
      <CreateDraft
        title='Travel redemptions'
        slug='travel'
        subtitle='Flights and hotels I book with points.'
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <CreateDraft
        title=''
        slug=''
        subtitle=''
      />
    </StoryFrame>
  ),
}

export const PageDetails: Story = {
  render: () => (
    <StoryFrame>
      <DetailsDraft />
    </StoryFrame>
  ),
}
