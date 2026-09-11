'use client'

import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { DnsInstructions, WellKnownInstructions } from './verification-token-instructions'
import { useTranslations } from '@/lib/i18n/use-translations'

interface TokenState {
  raw_token: string
  dns_instructions: { hostname: string; value: string }
  well_known_instructions: { url: string; file_content: string }
}

interface DomainTabsProps {
  hasHostname: boolean
  token: TokenState | null
  evidence: string
  loading: string | null
  copied: boolean
  onIssueToken: () => void
  onVerify: () => void
  onCopy: (text: string) => void
  onEvidenceChange: (text: string) => void
  onManualSubmit: () => void
}

export function DomainTabs({
  hasHostname,
  token,
  evidence,
  loading,
  copied,
  onIssueToken,
  onVerify,
  onCopy,
  onEvidenceChange,
  onManualSubmit,
}: DomainTabsProps) {
  const t = useTranslations()
  const generateBtn = (
    <Button
      onClick={onIssueToken}
      loading={loading === 'issue'}
      disabled={loading === 'issue'}
      size='sm'
    >
      {loading === 'issue'
        ? t('extracted.topicClaims.domainTabs.generating_49286f33')
        : t('extracted.topicClaims.domainTabs.generateVerificationToken_f8e63d60')}
    </Button>
  )

  return (
    <Tabs defaultValue={hasHostname ? 'dns' : 'manual'}>
      <TabsList>
        {hasHostname ? (
          <>
            <TabsTrigger value='dns'>
              {t('extracted.topicClaims.domainTabs.dnsTxtRecord_3ffe1b35')}
            </TabsTrigger>
            <TabsTrigger value='well-known'>
              {t('extracted.topicClaims.domainTabs.wellKnownFile_6ca0a254')}
            </TabsTrigger>
          </>
        ) : null}
        <TabsTrigger value='manual'>
          {t('extracted.topicClaims.domainTabs.submitEvidence_f51e2900')}
        </TabsTrigger>
      </TabsList>

      {hasHostname ? (
        <>
          <TabsContent
            value='dns'
            className='space-y-3'
          >
            <p className='text-sm text-muted-foreground'>
              {t('extracted.topicClaims.domainTabs.addATxtRecordToYour_14e91fb0')}
            </p>
            {token ? (
              <DnsInstructions
                token={token}
                copied={copied}
                loadingVerify={loading === 'verify'}
                onCopy={onCopy}
                onVerify={onVerify}
              />
            ) : (
              generateBtn
            )}
          </TabsContent>
          <TabsContent
            value='well-known'
            className='space-y-3'
          >
            <p className='text-sm text-muted-foreground'>
              {t('extracted.topicClaims.domainTabs.uploadAVerificationFileToYour_4499b98f')}
            </p>
            {token ? (
              <WellKnownInstructions
                token={token}
                loadingVerify={loading === 'verify'}
                onVerify={onVerify}
              />
            ) : (
              generateBtn
            )}
          </TabsContent>
        </>
      ) : null}

      <TabsContent
        value='manual'
        className='space-y-3'
      >
        <p className='text-sm text-muted-foreground'>
          {hasHostname
            ? t(
                'extracted.topicClaims.domainTabs.alternativelySubmitSupportingEvidenceForStaff_38db8786',
              )
            : t('extracted.topicClaims.domainTabs.thisTopicHasNoDomainSubmit_83d30597')}
        </p>
        <Textarea
          value={evidence}
          onChange={e => onEvidenceChange(e.target.value)}
          placeholder={t(
            'extracted.topicClaims.domainTabs.describeYourRelationshipToThisTopic_448457db',
          )}
          rows={4}
          data-pw='evidence-textarea'
        />
        <Button
          onClick={onManualSubmit}
          loading={loading === 'manual'}
          disabled={loading === 'manual' || !evidence.trim()}
        >
          {loading === 'manual'
            ? t('extracted.topicClaims.domainTabs.submitting_64115d5b')
            : t('extracted.topicClaims.domainTabs.submitForReview_40447e44')}
        </Button>
      </TabsContent>
    </Tabs>
  )
}
