export function hasSelfHostedRunnerLostCommunicationAnnotation(message: string): boolean {
  return (
    message.includes('The self-hosted runner lost communication with the server') &&
    message.includes('Verify the machine is running and has a healthy network connection')
  )
}
