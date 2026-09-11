'use client'

import type {
  LandingPage,
  LandingPageCandidates,
  LandingPageWithItems,
} from '@/types/landing-pages'
import { LandingPagesUsernameRequired } from './landing-pages-manager-sections'
import { CreatePageForm, PageDetailsForm } from './landing-pages-manager/page-forms'
import { PageList } from './landing-pages-manager/page-list'
import { LandingPageItemEditor } from './landing-pages-manager/item-picker'
import { useLandingPagesManagerController } from './landing-pages-manager/controller'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  username: string | null
  initialPages: LandingPage[]
  initialSelectedPage: LandingPageWithItems | null
  candidates: LandingPageCandidates
}

export function LandingPagesManager({
  username,
  initialPages,
  initialSelectedPage,
  candidates,
}: Props) {
  const t = useTranslations()
  const manager = useLandingPagesManagerController({
    initialPages,
    initialSelectedPage,
    candidates,
  })
  if (!username) return <LandingPagesUsernameRequired />
  return (
    <div className='space-y-8'>
      <div>
        <h1 className='text-2xl font-bold'>
          {t('extracted.my.landingPagesManager.landingPages_6e8d0e5d')}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t('extracted.my.landingPagesManager.createPublicLandingPagesForUsername_b00cca00', {
            username,
          })}
        </p>
      </div>
      <CreatePageForm
        loading={manager.loading}
        newTitle={manager.newTitle}
        newSlug={manager.newSlug}
        newSubtitle={manager.newSubtitle}
        onSubmit={manager.handleCreatePage}
        setNewTitle={manager.setNewTitle}
        setNewSlug={manager.setNewSlug}
        setNewSubtitle={manager.setNewSubtitle}
      />
      <div className='grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]'>
        <PageList
          pages={manager.pages}
          selectedPage={manager.selectedPage}
          username={username}
          onSelectPage={manager.handleSelectPage}
        />
        {manager.selectedPage ? (
          <div className='space-y-4'>
            <PageDetailsForm
              loading={manager.loading}
              selectedPage={manager.selectedPage}
              title={manager.title}
              slug={manager.slug}
              subtitle={manager.subtitle}
              onSubmit={manager.handleSaveDetails}
              onSetDefault={manager.handleSetDefaultPage}
              onDelete={manager.handleDeletePage}
              setTitle={manager.setTitle}
              setSlug={manager.setSlug}
              setSubtitle={manager.setSubtitle}
            />
            <LandingPageItemEditor
              loading={manager.loading}
              addType={manager.addType}
              selectedCandidateId={manager.selectedCandidateId}
              selectedTopicId={manager.selectedTopicId}
              selectedGroupReviewIds={manager.selectedGroupReviewIds}
              selectedGroupReferralIds={manager.selectedGroupReferralIds}
              options={manager.itemOptions}
              linkLabel={manager.linkLabel}
              linkUrl={manager.linkUrl}
              onAddTypeChange={manager.handleSetAddType}
              setSelectedCandidateId={manager.setSelectedCandidateId}
              setSelectedTopicId={manager.setSelectedTopicId}
              setSelectedGroupReviewIds={manager.setSelectedGroupReviewIds}
              setSelectedGroupReferralIds={manager.setSelectedGroupReferralIds}
              setLinkLabel={manager.setLinkLabel}
              setLinkUrl={manager.setLinkUrl}
              onAddItem={manager.handleAddItem}
              onSaveItems={manager.handleSaveItems}
              draftItems={manager.draftItems}
              moveItem={manager.moveItem}
              removeItem={manager.removeItem}
              moveGroupEntry={manager.moveGroupEntry}
              removeGroupEntry={manager.removeGroupEntry}
            />
          </div>
        ) : (
          <div className='rounded-lg border p-4 text-sm text-muted-foreground'>
            {t('extracted.my.landingPagesManager.createALandingPageOrSelect_765458b7')}
          </div>
        )}
      </div>
    </div>
  )
}
