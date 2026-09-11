import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
}

export function ChatLayout({ children }: Props) {
  if (
    !Array.isArray(children) ||
    children.length !== 2 ||
    !isPresentSlot(children[0]) ||
    !isPresentSlot(children[1])
  ) {
    throw new Error('ChatLayout requires exactly two children: messages and input.')
  }
  const [messages, input] = children

  return (
    <div className='mx-auto flex h-full w-full max-w-3xl flex-col'>
      <div className='flex min-h-0 flex-1 flex-col'>{messages}</div>
      {input}
    </div>
  )
}

function isPresentSlot(slot: ReactNode) {
  return slot !== null && slot !== undefined && slot !== false
}
