'use client'

import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LandingPageItemEditor } from '@/components/my/landing-pages-manager/item-picker'
import { PageDetailsForm } from '@/components/my/landing-pages-manager/page-forms'
import { landingPageHref, landingPageNamedHref } from '@/lib/links/entity-href'
import { useLandingPageEditorController } from './landing-page-editor-controller'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { LandingPageCandidates, LandingPageWithItems } from '@/types/landing-pages'

interface Props {
  initialPage: LandingPageWithItems
  candidates: LandingPageCandidates
  username: string
}

export function LandingPageEditor({ initialPage, candidates, username }: Props) {
  const t = useTranslations()
  const ctrl = useLandingPageEditorController(initialPage, candidates)
  const publicUrl = ctrl.page.is_default
    ? landingPageHref(username)
    : landingPageNamedHref(username, ctrl.page.slug)

  return (
    <div
      className='space-y-6'
      data-pw='landing-page-editor'
    >
      <div className='flex items-start justify-between gap-4'>
        <Button
          asChild
          variant='ghost'
          size='sm'
        >
          <Link
            href='/my/landing-pages'
            prefetch={false}
            data-pw='landing-page-editor-back'
          >
            <ArrowLeft className='mr-1 size-4' />
            {t('extracted.my.landingPageEditor.allPages_90354212')}
          </Link>
        </Button>
        <Button
          asChild
          variant='outline'
          size='sm'
        >
          <a
            href={publicUrl}
            target='_blank'
            rel='noopener noreferrer'
            data-pw='landing-page-editor-preview'
          >
            <ExternalLink className='mr-1 size-4' />
            {t('extracted.my.landingPageEditor.preview_324b134f')}
          </a>
        </Button>
      </div>

      <PageDetailsForm
        loading={ctrl.loading}
        selectedPage={ctrl.page}
        title={ctrl.title}
        slug={ctrl.slug}
        subtitle={ctrl.subtitle}
        onSubmit={ctrl.handleSaveDetails}
        onSetDefault={ctrl.handleSetDefault}
        onDelete={ctrl.handleDelete}
        setTitle={ctrl.setTitle}
        setSlug={ctrl.setSlug}
        setSubtitle={ctrl.setSubtitle}
      />

      <LandingPageItemEditor
        loading={ctrl.loading}
        addType={ctrl.addType}
        selectedCandidateId={ctrl.selectedCandidateId}
        selectedTopicId={ctrl.selectedTopicId}
        selectedGroupReviewIds={ctrl.selectedGroupReviewIds}
        selectedGroupReferralIds={ctrl.selectedGroupReferralIds}
        options={ctrl.itemOptions}
        linkLabel={ctrl.linkLabel}
        linkUrl={ctrl.linkUrl}
        onAddTypeChange={ctrl.handleSetAddType}
        setSelectedCandidateId={ctrl.setSelectedCandidateId}
        setSelectedTopicId={ctrl.setSelectedTopicId}
        setSelectedGroupReviewIds={ctrl.setSelectedGroupReviewIds}
        setSelectedGroupReferralIds={ctrl.setSelectedGroupReferralIds}
        setLinkLabel={ctrl.setLinkLabel}
        setLinkUrl={ctrl.setLinkUrl}
        onAddItem={ctrl.handleAddItem}
        onSaveItems={ctrl.handleSaveItems}
        draftItems={ctrl.draftItems}
        moveItem={ctrl.moveItem}
        removeItem={ctrl.removeItem}
        moveGroupEntry={ctrl.moveGroupEntry}
        removeGroupEntry={ctrl.removeGroupEntry}
      />
    </div>
  )
}
