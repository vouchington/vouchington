'use client'

import { ImagesFieldset } from './post-form-images-fieldset'
import { AdvancedOptions } from './post-form/advanced-options'
import { CommunitySelect } from './post-form/community-select'
import { ContentEditor } from './post-form/content-editor'
import { FormActions } from './post-form/form-actions'
import { HoneypotFields } from './post-form/honeypot-fields'
import { RelatedUrls } from './post-form/related-urls'
import { TitleField } from './post-form/title-field'
import { PostTypeFields } from './post-form/post-type-fields'
import { PostSlugField } from './post-form/post-slug-field'
import { UsernameRetryDialog } from './post-form/username-retry-dialog'
import { TurnstileField } from '@/components/shared/turnstile-field'
import { usePostFormController } from './post-form/use-post-form-controller'
import type { PostFormProps } from './post-form/types'

export function PostForm(props: PostFormProps) {
  const form = usePostFormController(props)
  return (
    <>
      <form
        onSubmit={form.handleSubmit}
        className='space-y-4'
        data-pw='post-form'
      >
        <TitleField
          contentLocked={form.contentLocked}
          setTitle={form.setTitle}
          title={form.title}
        />
        <PostSlugField
          initialSlug={form.post?.slug ?? ''}
          onSlugChange={form.handleSlugChange}
        />
        {!form.isEdit && !form.communitySlug && (
          <CommunitySelect
            communities={form.communityOptions}
            value={form.selectedCommunitySlug}
            onValueChange={form.handleSelectedCommunityChange}
          />
        )}
        <PostTypeFields
          contentLocked={form.contentLocked}
          dataPointVertical={form.dataPointVertical}
          discussions={form.discussions}
          postType={form.postType}
          reviews={form.reviews}
          saveToProfile={form.saveToProfile}
          setDataPointVertical={form.setDataPointVertical}
          setSaveToProfile={form.setSaveToProfile}
          setStructuredData={form.setStructuredData}
          structuredData={form.structuredData}
          userFinancialProfile={form.userFinancialProfile}
        />
        <RelatedUrls urls={form.initialRelatedUrls} />
        <ImagesFieldset
          images={form.imageState.images}
          onImageUploaded={form.imageState.handleImageUploaded}
          setIsUploading={form.imageState.setIsUploading}
          moveImage={form.imageState.moveImage}
          updateCaption={form.imageState.updateCaption}
          removeImage={form.imageState.removeImage}
        />
        <ContentEditor
          activeTab={form.preview.activeTab}
          contentLocked={form.contentLocked}
          markdown={form.markdown}
          postType={form.postType}
          language={form.language}
          previewHtml={form.preview.previewHtml}
          previewLoading={form.preview.previewLoading}
          reviewCharCount={form.reviewMetrics.charCount}
          reviewSentenceCount={form.reviewMetrics.sentenceCount}
          reviewWordCount={form.reviewMetrics.wordCount}
          setActiveTab={form.preview.setActiveTab}
          setMarkdown={form.setMarkdown}
          textareaRef={form.textareaRef}
        />
        {form.postType !== 'comment' && (
          <AdvancedOptions
            broadcast={form.broadcast}
            isAdvancedOpen={form.isAdvancedOpen}
            isAnonymous={form.isAnonymous}
            language={form.language}
            isCommunityPost={form.audience.isCommunityPost}
            isPrivateCommunityPost={form.audience.isPrivateCommunityPost}
            post={form.post}
            privacy={form.privacy}
            setBroadcast={form.setBroadcast}
            setIsAdvancedOpen={form.setIsAdvancedOpen}
            setIsAnonymous={form.setIsAnonymous}
            setLanguage={form.setLanguage}
            setPrivacy={form.setPrivacy}
          />
        )}
        <HoneypotFields
          hpPhoneRef={form.hpPhoneRef}
          hpWebsiteRef={form.hpWebsiteRef}
        />
        {!form.isEdit && <TurnstileField turnstile={form.turnstile} />}
        <FormActions
          isEdit={form.isEdit}
          isSubmitting={form.submit.isSubmitting}
          onCancel={form.handleBack}
          disabled={
            form.submit.isSubmitting ||
            form.imageState.isUploading ||
            !form.reviewMetrics.valid ||
            (!form.isEdit && !form.turnstile.token)
          }
        />
      </form>
      <UsernameRetryDialog
        open={form.submit.usernameDialogOpen}
        onUsernameSet={form.submit.handleUsernameSet}
        onClose={form.submit.handleUsernameClose}
      />
    </>
  )
}
