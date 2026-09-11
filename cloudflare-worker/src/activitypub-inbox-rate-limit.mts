export const isActivityPubInboxDeliveryRequest = (method: string, pathname: string): boolean =>
  method === 'POST' && pathname === '/ap/inbox'
