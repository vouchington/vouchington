import { MESSAGE_DESCRIPTORS } from '../../message-descriptors.mts'

const frCoreMessages = {
  nav: {
    home: 'Accueil',
    search: 'Recherche',
    notifications: 'Notifications',
    messages: 'Messages',
    profile: 'Profil',
    settings: 'Paramètres',
    sources: 'Sources',
    channels: 'Chaînes',
    podcasts: 'Podcasts',
    newsSources: "Sources d'actualités",
  },
  common: {
    save: 'Enregistrer',
    cancel: 'Annuler',
    currency: 'Devise',
    loading: 'Chargement…',
  },
  settings: {
    notificationSettings: {
      loadError:
        'Nous n’avons pas pu actualiser vos paramètres de notification. Vos paramètres enregistrés sont affichés.',
      retry: 'Réessayer',
      loadErrorFallback: 'Échec du chargement des paramètres de notification',
    },
    language: {
      title: 'Langue',
      description:
        'Choisissez la langue utilisée pour les menus, les boutons et autre texte dans tout le site.',
      countryLabel: 'Pays',
      noCountryPreference: 'Pas de préférence de pays',
      countrySaveSuccess: 'Préférence de pays enregistrée.',
      countrySaveError: "Impossible d'enregistrer la préférence de pays",
      interfaceLabel: "Langue de l'interface",
      useSiteDefault: 'Utiliser la langue par défaut du site',
      currentLabel: 'Langue actuelle : {language}',
      saveSuccess:
        "Langue de l'interface enregistrée. Rechargez la page pour appliquer la nouvelle langue.",
      saveError: "Impossible d'enregistrer la langue de l'interface",
      supportedCount: MESSAGE_DESCRIPTORS.fr.supportedCount,
    },
    activeSessions: {
      title: 'Sessions actives',
      description: 'Vérifiez les appareils connectés à votre compte.',
      signOutAllDevices: 'Déconnecter tous les appareils',
      signOutSession: 'Déconnecter la session',
      signOut: 'Déconnecter',
      empty: 'Aucune session active trouvée.',
      unknownDevice: 'Appareil inconnu',
      thisDevice: 'Cet appareil',
      signedInLastSeen: 'Connecté le {createdAt} · Dernière activité {lastSeenAt}',
      expires: 'Expire le {expiresAt}',
      expiresWithIp: 'Expire le {expiresAt} · IP {ipAddress}',
      confirmAllTitle: 'Déconnecter tous les appareils ?',
      confirmCurrentTitle: 'Déconnecter cet appareil ?',
      confirmSessionTitle: 'Déconnecter cette session ?',
      confirmAllDescription: 'Cela déconnectera Voucha sur tous les appareils, y compris celui-ci.',
      confirmCurrentDescription:
        'Cela mettra fin à votre session actuelle et vous renverra vers la connexion.',
      confirmSessionDescription:
        'Cela déconnectera ce navigateur ou cet appareil lors de sa prochaine requête.',
      toastSessionSignedOut: 'Session déconnectée',
      toastAllSessionsSignedOut: 'Toutes les sessions ont été déconnectées',
      toastFailedSignOutSession: 'Impossible de déconnecter la session',
      toastFailedSignOutAllDevices: 'Impossible de déconnecter tous les appareils',
    },
  },
  shared: {
    timeAgo: {
      relativeDuration: MESSAGE_DESCRIPTORS.fr.relativeDuration,
    },
    countLabel: {
      format: MESSAGE_DESCRIPTORS.fr.countLabel,
    },
  },
}

export default frCoreMessages
