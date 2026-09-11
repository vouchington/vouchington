const messages = {
  domains: {
    blockHostnameQuickAdd: {
      blockHostname_176e91d9: '¿Bloquear {hostname}?',
      blockHostname_60473140: 'Bloquear nombre de host',
      blockingWillSoftDeleteAllEntity_ffea2488:
        'El bloqueo eliminará suavemente todas las relaciones de entidad con URLs bajo este nombre de host y aplicará una penalización de peso de voto del 20% a cada usuario afectado. Los subdominios también están bloqueados. Esto no se puede revertir automáticamente.',
      blocking_c156afd1: 'Bloqueando…',
      cancel_19766ed6: 'Cancelar',
      exampleCom_a379a6f6: 'example.com',
      failedToBlockHostname_116bcd98: 'No se pudo bloquear el nombre de host',
      hostnameHasBeenBlocked_33f77377: '{hostname} ha sido bloqueado',
      hostnameToBlock_9e5a5d41: 'Nombre de host a bloquear',
    },
    domainActionsAside: {
      actions_ff8059dc: 'Acciones',
      blockContentFromThisDomain_7c3b277b: 'Bloquear contenido de este dominio',
      hideThisDomainFromYourFeed_27a18a75: 'Ocultar este dominio de tu feed',
    },
    domainCrawlersPanel: {
      actions_ff8059dc: 'Acciones',
      crawlers_9bb7d6d4: 'Rastreadores',
      description_526e0087: 'Descripción',
      edit_464c4ffd: 'Editar',
      noCrawlersConfiguredForThisHostname_ba9fc671:
        'Sin rastreadores configurados para este nombre de host.',
      priority_d60dbba0: 'Prioridad',
      type_baaddf70: 'Tipo',
      view_dcc839a4: 'Ver',
    },
    domainDetailTabs: {
      crawlers_9bb7d6d4: 'Rastreadores',
      domainDetailNavigation_17ad2cfa: 'Navegación de detalles de dominio',
      moderation_126d4415: 'Moderación',
      overview_d4b1ea57: 'Descripción general',
    },
    domainModerationPanel: {
      moderation_126d4415: 'Moderación',
    },
    domainTrustBadge: {
      countupCountdownNetNetdisplay_1424601e: '+{countUp} / -{countDown} (neto {netDisplay})',
      distrusted3OrFewerNetVotes_d8aa8135: 'No confiable: -3 o menos votos netos',
      labelDomain_d2ea6faa: 'Dominio {label}',
      labelTrustBadge_63af7352: 'Insignia de confianza {label}',
      neutralBetweenTrustedAndDistrustedThresholds_10b02a39:
        'Neutral: entre umbrales de confianza e desconfianza',
      totalvotesTotalVotes_d4499ddd: '{totalVotes} votos totales',
      trustIsBasedOnCommunityVotes_694635e9:
        'La confianza se basa en el sentimiento de la comunidad. 5+ votos positivos con puntuación neta ≥ 3 = Confiable.',
      trusted3NetVotesAnd5PositiveVotes_48d9392f: 'Confiable: 3+ votos netos y 5+ votos positivos',
      unratedNoVotesYet_3213d916: 'Sin calificar: sin votos aún',
    },
    domainsListClient: {
      noDomainsFound_7bb966c1: 'No se encontraron dominios',
      noDomainsHaveBeenAddedYet_a7fb2626: 'Aún no se han agregado dominios.',
      noDomainsMatchYourSearchTry_16de725d:
        'Ningún dominio coincide con tu búsqueda. Intenta una consulta diferente.',
    },
    domainsSearchForm: {
      allBlocked_8a7b119c: 'Todos (bloqueados)',
      allCrawlable_4467c377: 'Todos (rastreables)',
      blockedFilter_7f66e071: 'Filtro bloqueado',
      blocked_18f2a094: 'Bloqueado',
      crawlableFilter_d309fd94: 'Filtro rastreable',
      crawlable_8e55a03f: 'Rastreable',
      notBlocked_8625218c: 'No bloqueado',
      notCrawlable_7171ab3b: 'No rastreable',
      searchDomains_df3b2794: 'Buscar dominios',
      search_49c266ba: 'Buscar',
    },
    hostnameListItem: {
      blocked_18f2a094: 'Bloqueado',
      linkedTopic_828baa4e: 'Tema vinculado:',
      notCrawlable_7171ab3b: 'No rastreable',
    },
    hostnameModerationControls: {
      blockHostname_60473140: 'Bloquear nombre de host',
      blockThisHostname_06d3046e: '¿Bloquear este nombre de host?',
      blocked_18f2a094: 'Bloqueado',
      blockingWillSoftDeleteAllEntity_ffea2488:
        'El bloqueo eliminará suavemente todas las relaciones de entidad con URLs bajo este nombre de host y aplicará una penalización de peso de voto del 20% a cada usuario afectado. Los subdominios también están bloqueados. Esto no se puede revertir automáticamente.',
      cancel_19766ed6: 'Cancelar',
      crawlable_8e55a03f: 'Rastreable',
      failedToUpdateHostname_b1f39348: 'No se pudo actualizar el nombre de host',
      hostnameBlocked_51bbbc21: 'Nombre de host bloqueado',
      hostnameUnblocked_74158cff: 'Nombre de host desbloqueado',
      hostnameUpdated_f8ec2f41: 'Nombre de host actualizado',
      linkRelFollow_da993ba6: 'Link rel follow',
      thisWillUnblockTheHostnameExisting_97d65661:
        'Esto desbloqueará el nombre de host. Las relaciones eliminadas suavemente y las penalizaciones de voto existentes NO se restaurarán.',
      unblockThisHostname_373a1c75: 'Desbloquear',
      unblock_712da631: '¿Desbloquear este nombre de host?',
    },
    page: {
      domains_ced67718: 'Dominios',
      searchDomainsInspectTheLinkedTopic_6a8e3d17:
        'Busca dominios, inspecciona el tema vinculado y vota sobre la autoridad del dominio.',
    },
  },
}

export default messages
