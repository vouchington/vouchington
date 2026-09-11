import { MESSAGE_DESCRIPTORS } from '../../message-descriptors.mts'

const enCoreMessages = {
  nav: {
    home: 'Home',
    search: 'Search',
    notifications: 'Notifications',
    messages: 'Messages',
    profile: 'Profile',
    settings: 'Settings',
    sources: 'Sources',
    channels: 'Channels',
    podcasts: 'Podcasts',
    newsSources: 'News Sources',
  },
  common: {
    save: 'Save',
    cancel: 'Cancel',
    currency: 'Currency',
    loading: 'Loading…',
  },
  settings: {
    notificationSettings: {
      loadError: 'We could not refresh your notification settings. Your saved settings are shown.',
      retry: 'Retry',
      loadErrorFallback: 'Failed to load notification settings',
    },
    language: {
      title: 'Language',
      description: 'Choose the language used for menus, buttons, and other text across the site.',
      countryLabel: 'Country',
      noCountryPreference: 'No country preference',
      countrySaveSuccess: 'Country preference saved.',
      countrySaveError: 'Failed to save country preference',
      interfaceLabel: 'Interface language',
      useSiteDefault: 'Use site default',
      currentLabel: 'Current language: {language}',
      saveSuccess: 'Interface language saved. Reload the page to apply the new language.',
      saveError: 'Failed to save interface language',
      supportedCount: MESSAGE_DESCRIPTORS.en.supportedCount,
    },
    activeSessions: {
      title: 'Active sessions',
      description: 'Review the devices signed into your account.',
      signOutAllDevices: 'Sign out all devices',
      signOutSession: 'Sign out session',
      signOut: 'Sign out',
      empty: 'No active sessions found.',
      unknownDevice: 'Unknown device',
      thisDevice: 'This device',
      signedInLastSeen: 'Signed in {createdAt} · Last seen {lastSeenAt}',
      expires: 'Expires {expiresAt}',
      expiresWithIp: 'Expires {expiresAt} · IP {ipAddress}',
      confirmAllTitle: 'Sign out all devices?',
      confirmCurrentTitle: 'Sign out on this device?',
      confirmSessionTitle: 'Sign out this session?',
      confirmAllDescription: 'This will sign out Voucha on every device, including this one.',
      confirmCurrentDescription: 'This will end your current session and send you back to login.',
      confirmSessionDescription:
        'This will sign out that browser or device the next time it makes a request.',
      toastSessionSignedOut: 'Session signed out',
      toastAllSessionsSignedOut: 'All sessions signed out',
      toastFailedSignOutSession: 'Failed to sign out session',
      toastFailedSignOutAllDevices: 'Failed to sign out all devices',
    },
  },
  shared: {
    timeAgo: {
      relativeDuration: MESSAGE_DESCRIPTORS.en.relativeDuration,
    },
    countLabel: {
      format: MESSAGE_DESCRIPTORS.en.countLabel,
    },
  },
}

export default enCoreMessages
