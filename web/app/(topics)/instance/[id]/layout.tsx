import { notFound } from 'next/navigation'

import { getEffectiveServerFeatureFlag } from '@/lib/feature-flags/server'
import { createTopicLayout } from '@/lib/routes/topic-layout-factory'

export const dynamic = 'force-dynamic'

const renderInstanceLayout = createTopicLayout('fediverse_instance')

interface InstanceLayoutProps {
  params: Promise<{ id: string }>
  children: React.ReactNode
}

export default async function InstanceLayout(props: InstanceLayoutProps) {
  if (!(await getEffectiveServerFeatureFlag('fediverse'))) notFound()
  return renderInstanceLayout(props)
}
