export function CommunityAgentPromptSimulationMetric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='text-lg font-semibold'>{value}</dd>
    </div>
  )
}
