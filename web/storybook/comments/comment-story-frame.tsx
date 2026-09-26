import type { ReactNode } from 'react'
import { StoryFrame } from '@/storybook/story-frame'

export function CommentStoryFrame({ children, width }: { children: ReactNode; width?: string }) {
  return (
    <StoryFrame width={width}>
      <div className='[&_a]:min-h-6 [&_a]:min-w-6 [&_button]:min-h-6 [&_button]:min-w-6'>
        {children}
      </div>
    </StoryFrame>
  )
}
