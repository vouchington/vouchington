'use client'

import { useReducer } from 'react'
import onError, { onSuccess } from '@/lib/on-error'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { sendCrmEmail } from '@/lib/api/client/crm'
import type { WebCrmMessage, CrmEmailDraft } from '@/types/crm'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  contactId: string
  initialDraft?: CrmEmailDraft | null
  onSent?: (message: WebCrmMessage) => void
}

interface State {
  open: boolean
  subject: string
  bodyText: string
  provider: 'ses' | 'gmail_smtp'
  sending: boolean
}

type Action = Partial<State> | ((state: State) => Partial<State>)

function reducer(state: State, action: Action): State {
  return { ...state, ...(typeof action === 'function' ? action(state) : action) }
}

export function CrmEmailComposeDialog({ contactId, initialDraft, onSent }: Props) {
  const t = useTranslations()
  const [state, dispatch] = useReducer(reducer, {
    open: false,
    subject: initialDraft?.subject ?? '',
    bodyText: initialDraft?.body_text ?? '',
    provider: 'gmail_smtp',
    sending: false,
  })

  function handleOpenChange(next: boolean) {
    if (next) {
      dispatch({ open: true })
    } else {
      dispatch({
        open: false,
        subject: initialDraft?.subject ?? '',
        bodyText: initialDraft?.body_text ?? '',
        sending: false,
      })
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!state.subject.trim() || !state.bodyText.trim()) return
    dispatch({ sending: true })
    try {
      const { message } = await sendCrmEmail(contactId, {
        subject: state.subject.trim(),
        body_text: state.bodyText.trim(),
        email_provider: state.provider,
        ai_prompt: initialDraft ? `(AI-drafted)` : null,
        ai_generated_at: initialDraft ? new Date().toISOString() : null,
      })
      onSuccess(t('extracted.contactid.crmEmailComposeDialog.emailSent_a5e14a58'))
      onSent?.(message)
      dispatch({ open: false })
    } catch (error) {
      onError(error, {
        fallback: t('extracted.contactid.crmEmailComposeDialog.failedToSendEmail_5494bd23'),
        tags: { form: 'crm-email' },
      })
    } finally {
      dispatch({ sending: false })
    }
  }

  return (
    <Dialog
      open={state.open}
      onOpenChange={handleOpenChange}
    >
      <DialogTrigger asChild>
        <Button
          size='sm'
          data-pw='crm-compose-email-trigger'
        >
          <Send className='mr-2 h-4 w-4' />
          {t('extracted.contactid.crmEmailComposeDialog.composeEmail_0e216164')}
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <DialogTitle>
            {t('extracted.contactid.crmEmailComposeDialog.composeEmail_0e216164')}
          </DialogTitle>
          <DialogDescription className='sr-only'>
            {t('extracted.contactid.crmEmailComposeDialog.composeAndSendAnEmailTo_3b0a2a52')}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSend}
          className='space-y-4'
        >
          <div className='space-y-2'>
            <Label htmlFor='email-subject'>
              {t('extracted.contactid.crmEmailComposeDialog.subject_68971283')}
            </Label>
            <Input
              id='email-subject'
              data-pw='crm-compose-email-subject'
              value={state.subject}
              onChange={e => dispatch({ subject: e.target.value })}
              placeholder={t('extracted.contactid.crmEmailComposeDialog.emailSubject_3739a3db')}
              required
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='email-body'>
              {t('extracted.contactid.crmEmailComposeDialog.body_6ccaa641')}
            </Label>
            <Textarea
              id='email-body'
              value={state.bodyText}
              onChange={e => dispatch({ bodyText: e.target.value })}
              placeholder={t('extracted.contactid.crmEmailComposeDialog.emailBody_66050849')}
              rows={10}
              required
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='email-provider'>
              {t('extracted.contactid.crmEmailComposeDialog.provider_472590ae')}
            </Label>
            <Select
              value={state.provider}
              onValueChange={v => dispatch({ provider: v as 'ses' | 'gmail_smtp' })}
            >
              <SelectTrigger
                id='email-provider'
                className='w-40'
              >
                <SelectValue
                  placeholder={t(
                    'extracted.contactid.crmEmailComposeDialog.selectProvider_644c6aae',
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='gmail_smtp'>
                  {t('extracted.contactid.crmEmailComposeDialog.gmailPersonal_13dc03f6')}
                </SelectItem>
                <SelectItem value='ses'>
                  {t('extracted.contactid.crmEmailComposeDialog.sesBulk_831d30d0')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type='submit'
              loading={state.sending}
              disabled={state.sending || !state.subject.trim() || !state.bodyText.trim()}
            >
              {state.sending
                ? t('extracted.contactid.crmEmailComposeDialog.sending_1a9c4e7f')
                : t('extracted.contactid.crmEmailComposeDialog.sendEmail_7bd21e5c')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
