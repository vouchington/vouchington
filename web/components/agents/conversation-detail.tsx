import Link from 'next/link'
import type { Agent, ConversationMessage } from '@/types/agents'
import { agentHref, chatHref } from '@/lib/links/entity-href'
import { getTranslations } from '@/lib/i18n/get-translations'
import { ConversationMessagesClient } from './conversation-messages-client'

interface ConversationDetailProps {
  agent: Agent
  conversation: {
    id: string
    title: string
    created_at: string
    created_by_id: string
  }
  messages: ConversationMessage[]
  pageInfo: { has_next_page: boolean; end_cursor: string | null; start_cursor: string | null }
}

export async function ConversationDetail({
  agent,
  conversation,
  messages,
  pageInfo,
}: ConversationDetailProps) {
  const t = await getTranslations()
  return (
    <div className='space-y-4'>
      {/* Breadcrumb */}
      <nav className='text-sm text-muted-foreground'>
        <Link
          href='/agents'
          prefetch={false}
          className='hover:underline'
        >
          {t('extracted.agents.conversationDetail.agents_279b44d2')}
        </Link>
        {' / '}
        <Link
          href={agentHref(agent)}
          prefetch={false}
          className='hover:underline'
        >
          {agent.slug ?? agent.id.slice(0, 8)}
        </Link>
        {' / '}
        <span>{t('extracted.agents.conversationDetail.conversation_ccca1817')}</span>
      </nav>

      {/* Header */}
      <div>
        <h1 className='text-2xl font-bold'>
          <Link
            href={chatHref(conversation)}
            prefetch={false}
            className='hover:underline focus-visible:underline'
          >
            {conversation.title ||
              t('extracted.agents.conversationDetail.untitledConversation_13fb26cc')}
          </Link>
        </h1>
        <p
          className='text-sm text-muted-foreground'
          suppressHydrationWarning
        >
          {new Date(conversation.created_at).toLocaleString()}
        </p>
      </div>

      {/* Messages */}
      <ConversationMessagesClient
        initialData={{ results: messages, page_info: pageInfo }}
        endpoint={`/api/v1/agents/${encodeURIComponent(agent.id)}/conversations/${encodeURIComponent(conversation.id)}`}
        agentSystemUserId={agent.system_user_id}
        agentLabel={agent.slug ?? t('extracted.agents.conversationDetail.agent_11b39c93')}
        userLabel={t('extracted.agents.conversationDetail.user_b512d97e')}
        emptyLabel={t('extracted.agents.conversationDetail.empty_d29a0939')}
        loadingLabel={t('extracted.moderation.userModNotesPanel.loading_ba3bbbe1')}
        loadOlderLabel={t('extracted.threadid.modmailThreadClient.loadOlderMessages_f17671d8')}
        retryLabel={t('extracted.shared.paginatedListFooter.retry_942087cc')}
      />
    </div>
  )
}
