'use client'

import { Bot, Wrench } from 'lucide-react'
import type { ChatSSESubagentStep } from '@/types/chat'

interface Props {
  steps: ChatSSESubagentStep[]
}

const AGENT_LABELS: Record<string, string> = {
  research: 'Researching',
  profile: 'Updating profile',
  discovery: 'Discovering',
}

function agentLabel(agentName: string): string {
  return AGENT_LABELS[agentName] ?? agentName
}

export function ChatSubagentProgress({ steps }: Props) {
  // Show only the most recent step as the active one
  const latestStep = steps.at(-1)
  if (!latestStep) return null

  return (
    <div className='mb-2 flex items-center gap-2 rounded-md bg-background/50 px-2 py-1 text-xs text-muted-foreground'>
      <Bot className='size-3 shrink-0 animate-pulse' />
      <span className='font-medium'>{agentLabel(latestStep.agent_name)}</span>
      <Wrench className='size-3 shrink-0' />
      <span className='font-mono'>{latestStep.tool_name}</span>
    </div>
  )
}
