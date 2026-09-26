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
  const [created, setCreated] = useState<string | null>(null)
  if (created) return <p>Created {created}</p>
  return (
    <CreatePageForm
      loading={false}
      newTitle={pageTitle}
      newSlug={pageSlug}
      newSubtitle={pageSubtitle}
      onSubmit={event => {
        event.preventDefault()
        setCreated(pageTitle || 'Untitled page')
      }}
      setNewTitle={setPageTitle}
      setNewSlug={setPageSlug}
      setNewSubtitle={setPageSubtitle}
    />
  )
}

function DetailsDraft() {
  const initialPage = {
    ...landingPageWithItems,
    id: 'landing-page-travel',
    title: 'Travel redemptions',
    slug: 'travel',
    is_default: false,
    subtitle: 'Flights and hotels I book with points.',
  }
  const [page, setPage] = useState(initialPage)
  const [title, setTitle] = useState(page.title)
  const [slug, setSlug] = useState(page.slug)
  const [subtitle, setSubtitle] = useState(page.subtitle ?? '')
  const [removed, setRemoved] = useState(false)
  if (removed) return <p>Deleted {page.title}</p>
  return (
    <PageDetailsForm
      loading={false}
      selectedPage={page}
      title={title}
      slug={slug}
      subtitle={subtitle}
      onSubmit={event => {
        event.preventDefault()
        setPage(current => ({ ...current, title, slug, subtitle }))
      }}
      onSetDefault={() => setPage(current => ({ ...current, is_default: true }))}
      onDelete={() => setRemoved(true)}
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
