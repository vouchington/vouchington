import { MESSAGE_DESCRIPTORS } from '../../message-descriptors.mts'

const esCoreMessages = {
  nav: {
    home: 'Inicio',
    search: 'Buscar',
    notifications: 'Notificaciones',
    messages: 'Mensajes',
    profile: 'Perfil',
    settings: 'Configuración',
    sources: 'Fuentes',
    channels: 'Canales',
    podcasts: 'Podcasts',
    newsSources: 'Fuentes de noticias',
  },
  common: {
    save: 'Guardar',
    cancel: 'Cancelar',
    currency: 'Moneda',
    loading: 'Cargando…',
  },
  settings: {
    notificationSettings: {
      loadError:
        'No se pudieron actualizar tus ajustes de notificaciones. Se muestran tus ajustes guardados.',
      retry: 'Reintentar',
      loadErrorFallback: 'No se pudieron cargar los ajustes de notificaciones',
    },
    language: {
      title: 'Idioma',
      description: 'Elige el idioma utilizado para menús, botones y otros textos en todo el sitio.',
      countryLabel: 'País',
      noCountryPreference: 'Sin preferencia de país',
      countrySaveSuccess: 'Preferencia de país guardada.',
      countrySaveError: 'No se pudo guardar la preferencia de país',
      interfaceLabel: 'Idioma de la interfaz',
      useSiteDefault: 'Usar configuración predeterminada del sitio',
      currentLabel: 'Idioma actual: {language}',
      saveSuccess:
        'Idioma de la interfaz guardado. Recarga la página para aplicar el nuevo idioma.',
      saveError: 'No se pudo guardar el idioma de la interfaz',
      supportedCount: MESSAGE_DESCRIPTORS.es.supportedCount,
    },
    activeSessions: {
      title: 'Sesiones activas',
      description: 'Revisa los dispositivos conectados a tu cuenta.',
      signOutAllDevices: 'Cerrar sesión en todos los dispositivos',
      signOutSession: 'Cerrar sesión',
      signOut: 'Cerrar sesión',
      empty: 'No se encontraron sesiones activas.',
      unknownDevice: 'Dispositivo desconocido',
      thisDevice: 'Este dispositivo',
      signedInLastSeen: 'Sesión iniciada {createdAt} · Visto por última vez {lastSeenAt}',
      expires: 'Expira {expiresAt}',
      expiresWithIp: 'Expira {expiresAt} · IP {ipAddress}',
      confirmAllTitle: '¿Cerrar sesión en todos los dispositivos?',
      confirmCurrentTitle: '¿Cerrar sesión en este dispositivo?',
      confirmSessionTitle: '¿Cerrar esta sesión?',
      confirmAllDescription:
        'Esto cerrará la sesión de Voucha en todos los dispositivos, incluido este.',
      confirmCurrentDescription:
        'Esto finalizará tu sesión actual y te enviará de vuelta al inicio de sesión.',
      confirmSessionDescription:
        'Esto cerrará la sesión de ese navegador o dispositivo la próxima vez que haga una solicitud.',
      toastSessionSignedOut: 'Sesión cerrada',
      toastAllSessionsSignedOut: 'Todas las sesiones cerradas',
      toastFailedSignOutSession: 'No se pudo cerrar la sesión',
      toastFailedSignOutAllDevices: 'No se pudo cerrar sesión en todos los dispositivos',
    },
  },
  shared: {
    timeAgo: {
      relativeDuration: MESSAGE_DESCRIPTORS.es.relativeDuration,
    },
    countLabel: {
      format: MESSAGE_DESCRIPTORS.es.countLabel,
    },
  },
}

export default esCoreMessages
