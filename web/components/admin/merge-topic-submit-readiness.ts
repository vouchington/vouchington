export function canSubmitTopicMerge({
  destinationTopicId,
  confirmation,
  topicName,
  submitting,
}: {
  destinationTopicId: string | null
  confirmation: string
  topicName: string
  submitting: boolean
}) {
  return Boolean(destinationTopicId) && confirmation === topicName && !submitting
}
