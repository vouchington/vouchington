export type CopyrightParticipantStatement = {
  id: string
  delivery_kind: string
  state: 'pending' | 'claimed' | 'sent' | 'failed' | 'bounced'
  sent_at: string | null
  text: string
}
