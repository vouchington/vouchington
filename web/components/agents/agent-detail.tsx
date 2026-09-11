import Link from 'next/link'
import type { Agent, AgentUser } from '@/types/agents'
import { getAgentDisplayName } from '@/lib/agents/display-name'
import { agentHref } from '@/lib/links/entity-href'
import { getTranslations } from '@/lib/i18n/get-translations'

interface AgentDetailProps {
  agent: Agent
  user: AgentUser | null
}

export async function AgentDetail({ agent, user }: AgentDetailProps) {
  const t = await getTranslations()
  const isActive = agent.activated_at && !agent.deactivated_at
  const displayName = getAgentDisplayName(
    user,
    agent.slug ??
      t('extracted.agents.agentDetail.agentAgentid_be30b7fa', {
        agentId: agent.id.slice(0, 8),
      }),
  )

  return (
    <div className='space-y-4'>
      <div className='flex items-center gap-3'>
        <h1
          data-pw='agent-detail-heading'
          className='text-xl font-semibold'
        >
          <Link
            href={agentHref(agent)}
            prefetch={false}
            className='hover:underline focus-visible:underline'
          >
            {displayName}
          </Link>
        </h1>
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
            isActive
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {isActive
            ? t('extracted.agents.agentDetail.active_92340695')
            : t('extracted.agents.agentDetail.inactive_ac7c949f')}
        </span>
      </div>

      <dl className='grid grid-cols-2 gap-4 text-sm sm:grid-cols-4'>
        <div>
          <dt className='text-muted-foreground'>
            {t('extracted.agents.agentDetail.type_baaddf70')}
          </dt>
          <dd className='mt-1 font-medium capitalize'>{agent.agent_type}</dd>
        </div>
        <div>
          <dt className='text-muted-foreground'>{t('extracted.agents.agentDetail.id_3843971d')}</dt>
          <dd className='mt-1 font-mono text-xs'>{agent.id}</dd>
        </div>
        <div>
          <dt className='text-muted-foreground'>
            {t('extracted.agents.agentDetail.systemUser_3ef7bfd4')}
          </dt>
          <dd className='mt-1 font-mono text-xs'>{agent.system_user_id}</dd>
        </div>
        <div>
          <dt className='text-muted-foreground'>
            {t('extracted.agents.agentDetail.created_d70b9e24')}
          </dt>
          <dd
            className='mt-1'
            suppressHydrationWarning
          >
            {new Date(agent.created_at).toLocaleDateString()}
          </dd>
        </div>
      </dl>
    </div>
  )
}
