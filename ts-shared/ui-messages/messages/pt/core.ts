import { MESSAGE_DESCRIPTORS } from '../../message-descriptors.mts'

const ptCoreMessages = {
  nav: {
    home: 'Início',
    search: 'Pesquisar',
    notifications: 'Notificações',
    messages: 'Mensagens',
    profile: 'Perfil',
    settings: 'Configurações',
    sources: 'Fontes',
    channels: 'Canais',
    podcasts: 'Podcasts',
    newsSources: 'Fontes de notícias',
  },
  common: {
    save: 'Salvar',
    cancel: 'Cancelar',
    currency: 'Moeda',
    loading: 'Carregando…',
  },
  settings: {
    notificationSettings: {
      loadError:
        'Não foi possível atualizar suas configurações de notificação. Suas configurações salvas estão sendo exibidas.',
      retry: 'Tentar novamente',
      loadErrorFallback: 'Falha ao carregar as configurações de notificação',
    },
    language: {
      title: 'Idioma',
      description: 'Escolha o idioma usado para menus, botões e outros textos em todo o site.',
      countryLabel: 'País',
      noCountryPreference: 'Sem preferência de país',
      countrySaveSuccess: 'Preferência de país salva.',
      countrySaveError: 'Falha ao salvar a preferência de país',
      interfaceLabel: 'Idioma da interface',
      useSiteDefault: 'Usar idioma padrão do site',
      currentLabel: 'Idioma atual: {language}',
      saveSuccess: 'Idioma da interface salvo. Recarregue a página para aplicar o novo idioma.',
      saveError: 'Falha ao salvar o idioma da interface',
      supportedCount: MESSAGE_DESCRIPTORS.pt.supportedCount,
    },
    activeSessions: {
      title: 'Sessões ativas',
      description: 'Revise os dispositivos conectados à sua conta.',
      signOutAllDevices: 'Sair de todos os dispositivos',
      signOutSession: 'Sair da sessão',
      signOut: 'Sair',
      empty: 'Nenhuma sessão ativa encontrada.',
      unknownDevice: 'Dispositivo desconhecido',
      thisDevice: 'Este dispositivo',
      signedInLastSeen: 'Entrou em {createdAt} · Visto por último {lastSeenAt}',
      expires: 'Expira em {expiresAt}',
      expiresWithIp: 'Expira em {expiresAt} · IP {ipAddress}',
      confirmAllTitle: 'Sair de todos os dispositivos?',
      confirmCurrentTitle: 'Sair neste dispositivo?',
      confirmSessionTitle: 'Sair desta sessão?',
      confirmAllDescription:
        'Isso encerrará sua sessão do Voucha em todos os dispositivos, incluindo este.',
      confirmCurrentDescription:
        'Isso encerrará sua sessão atual e enviará você de volta para o login.',
      confirmSessionDescription:
        'Isso encerrará a sessão desse navegador ou dispositivo na próxima solicitação.',
      toastSessionSignedOut: 'Sessão encerrada',
      toastAllSessionsSignedOut: 'Todas as sessões encerradas',
      toastFailedSignOutSession: 'Falha ao encerrar a sessão',
      toastFailedSignOutAllDevices: 'Falha ao sair de todos os dispositivos',
    },
  },
  shared: {
    timeAgo: {
      relativeDuration: MESSAGE_DESCRIPTORS.pt.relativeDuration,
    },
    countLabel: {
      format: MESSAGE_DESCRIPTORS.pt.countLabel,
    },
  },
}

export default ptCoreMessages
