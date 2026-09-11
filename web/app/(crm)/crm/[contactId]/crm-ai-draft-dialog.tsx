'use client'

import { useState } from 'react'
import onError from '@/lib/on-error'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { generateCrmEmailDraft } from '@/lib/api/client/crm'
import { CrmEmailComposeDialog } from './crm-email-compose-dialog'
import type { CrmEmailDraft, WebCrmMessage } from '@/types/crm'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  contactId: string
  onSent?: (message: WebCrmMessage) => void
}

export function CrmAiDraftDialog({ contactId, onSent }: Props) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [draft, setDraft] = useState<CrmEmailDraft | null>(null)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setPrompt('')
      setDraft(null)
    }
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    setGenerating(true)
    setDraft(null)
    try {
      const { draft: generated } = await generateCrmEmailDraft(contactId, {
        prompt: prompt.trim() || undefined,
      })
      setDraft(generated)
    } catch (error) {
      onError(error, {
        fallback: t('extracted.contactid.crmAiDraftDialog.failedToGenerateDraft_398d0942'),
        tags: { form: 'crm-ai-draft' },
      })
    } finally {
      setGenerating(false)
    }
  }

  function handleSent(message: WebCrmMessage) {
    onSent?.(message)
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
    >
      <DialogTrigger asChild>
        <Button
          variant='outline'
          size='sm'
        >
          <Sparkles className='mr-2 h-4 w-4' />
          {t('extracted.contactid.crmAiDraftDialog.aiDraft_cf76a5a2')}
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <DialogTitle>
            {t('extracted.contactid.crmAiDraftDialog.generateAiEmailDraft_985c6689')}
          </DialogTitle>
          <DialogDescription className='sr-only'>
            {t('extracted.contactid.crmAiDraftDialog.generateAnAiDraftedEmailFor_d5bc6bf4')}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-4'>
          <form
            onSubmit={handleGenerate}
            className='space-y-3'
          >
            <div className='space-y-2'>
              <Label htmlFor='ai-prompt'>
                {t('extracted.contactid.crmAiDraftDialog.instructionsOptional_396f78a9')}
              </Label>
              <Textarea
                id='ai-prompt'
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder={t('extracted.contactid.crmAiDraftDialog.eGFocusOnOurTravel_763a386e')}
                rows={3}
              />
            </div>
            <Button
              type='submit'
              loading={generating}
              disabled={generating}
            >
              {!generating && <Sparkles className='h-4 w-4' />}
              {generating
                ? t('extracted.contactid.crmAiDraftDialog.generating_49286f33')
                : t('extracted.contactid.crmAiDraftDialog.generateDraft_c6edd0e8')}
            </Button>
          </form>

          {draft && (
            <div className='space-y-3 rounded-md border bg-muted/30 p-4'>
              <div>
                <p className='text-xs font-medium uppercase text-muted-foreground'>
                  {t('extracted.contactid.crmAiDraftDialog.subject_68971283')}
                </p>
                <p className='mt-1 text-sm text-foreground'>{draft.subject}</p>
              </div>
              <div>
                <p className='text-xs font-medium uppercase text-muted-foreground'>
                  {t('extracted.contactid.crmAiDraftDialog.body_6ccaa641')}
                </p>
                <ScrollArea className='mt-1 max-h-48'>
                  <pre className='whitespace-pre-wrap text-sm text-foreground'>
                    {draft.body_text}
                  </pre>
                </ScrollArea>
              </div>
              <CrmEmailComposeDialog
                contactId={contactId}
                initialDraft={draft}
                onSent={handleSent}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
