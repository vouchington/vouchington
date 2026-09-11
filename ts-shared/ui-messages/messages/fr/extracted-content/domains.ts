const messages = {
  domains: {
    blockHostnameQuickAdd: {
      blockHostname_176e91d9: 'Bloquer {hostname}?',
      blockHostname_60473140: "Bloquer le nom d'hôte",
      blockingWillSoftDeleteAllEntity_ffea2488:
        "Le blocage supprimera en douceur toutes les relations d'entité vers les URL sous ce nom d'hôte et appliquera une pénalité de poids de vote de 20% à chaque utilisateur affecté. Les sous-domaines sont également bloqués. Cela ne peut pas être automatiquement annulé.",
      blocking_c156afd1: 'Blocage en cours…',
      cancel_19766ed6: 'Annuler',
      exampleCom_a379a6f6: 'example.com',
      failedToBlockHostname_116bcd98: "Échec du blocage du nom d'hôte",
      hostnameHasBeenBlocked_33f77377: '{hostname} a été bloqué',
      hostnameToBlock_9e5a5d41: "Nom d'hôte à bloquer",
    },
    domainActionsAside: {
      actions_ff8059dc: 'Actions',
      blockContentFromThisDomain_7c3b277b: 'Bloquer le contenu de ce domaine',
      hideThisDomainFromYourFeed_27a18a75: "Masquer ce domaine de votre fil d'actualité",
    },
    domainCrawlersPanel: {
      actions_ff8059dc: 'Actions',
      crawlers_9bb7d6d4: 'Robots',
      description_526e0087: 'Description',
      edit_464c4ffd: 'Modifier',
      noCrawlersConfiguredForThisHostname_ba9fc671: "Aucun robot configuré pour ce nom d'hôte.",
      priority_d60dbba0: 'Priorité',
      type_baaddf70: 'Type',
      view_dcc839a4: 'Afficher',
    },
    domainDetailTabs: {
      crawlers_9bb7d6d4: 'Robots',
      domainDetailNavigation_17ad2cfa: 'Navigation des détails du domaine',
      moderation_126d4415: 'Modération',
      overview_d4b1ea57: 'Aperçu',
    },
    domainModerationPanel: {
      moderation_126d4415: 'Modération',
    },
    domainTrustBadge: {
      countupCountdownNetNetdisplay_1424601e: '+{countUp} / -{countDown} (net {netDisplay})',
      distrusted3OrFewerNetVotes_d8aa8135: 'Non approuvé: -3 votes nets ou moins',
      labelDomain_d2ea6faa: 'Domaine {label}',
      labelTrustBadge_63af7352: 'Insigne de confiance {label}',
      neutralBetweenTrustedAndDistrustedThresholds_10b02a39:
        'Neutre: entre les seuils de confiance et de méfiance',
      totalvotesTotalVotes_d4499ddd: '{totalVotes} votes au total',
      trustIsBasedOnCommunityVotes_694635e9:
        'La confiance repose sur le sentiment de la communauté. 5 votes positifs ou plus avec un score net ≥ 3 = Fiable.',
      trusted3NetVotesAnd5PositiveVotes_48d9392f:
        'Fiable : 3 votes nets ou plus et 5 votes positifs ou plus',
      unratedNoVotesYet_3213d916: "Non noté: aucun vote pour l'instant",
    },
    domainsListClient: {
      noDomainsFound_7bb966c1: 'Aucun domaine trouvé',
      noDomainsHaveBeenAddedYet_a7fb2626: "Aucun domaine n'a été ajouté pour l'instant.",
      noDomainsMatchYourSearchTry_16de725d:
        'Aucun domaine ne correspond à votre recherche. Essayez une requête différente.',
    },
    domainsSearchForm: {
      allBlocked_8a7b119c: 'Tous (bloqués)',
      allCrawlable_4467c377: 'Tous (accessibles)',
      blockedFilter_7f66e071: 'Filtre bloqué',
      blocked_18f2a094: 'Bloqué',
      crawlableFilter_d309fd94: 'Filtre accessible',
      crawlable_8e55a03f: 'Accessible',
      notBlocked_8625218c: 'Non bloqué',
      notCrawlable_7171ab3b: 'Non accessible',
      searchDomains_df3b2794: 'Rechercher les domaines',
      search_49c266ba: 'Recherche',
    },
    hostnameListItem: {
      blocked_18f2a094: 'Bloqué',
      linkedTopic_828baa4e: 'Sujet lié:',
      notCrawlable_7171ab3b: 'Non accessible',
    },
    hostnameModerationControls: {
      blockHostname_60473140: "Bloquer le nom d'hôte",
      blockThisHostname_06d3046e: "Bloquer ce nom d'hôte?",
      blocked_18f2a094: 'Bloqué',
      blockingWillSoftDeleteAllEntity_ffea2488:
        "Le blocage supprimera en douceur toutes les relations d'entité vers les URL sous ce nom d'hôte et appliquera une pénalité de poids de vote de 20% à chaque utilisateur affecté. Les sous-domaines sont également bloqués. Cela ne peut pas être automatiquement annulé.",
      cancel_19766ed6: 'Annuler',
      crawlable_8e55a03f: 'Accessible',
      failedToUpdateHostname_b1f39348: "Échec de la mise à jour du nom d'hôte",
      hostnameBlocked_51bbbc21: "Nom d'hôte bloqué",
      hostnameUnblocked_74158cff: "Nom d'hôte débloqué",
      hostnameUpdated_f8ec2f41: "Nom d'hôte mis à jour",
      linkRelFollow_da993ba6: 'Link rel follow',
      thisWillUnblockTheHostnameExisting_97d65661:
        "Cela débloquera le nom d'hôte. Les relations supprimées en douceur et les pénalités de vote existantes ne seront PAS restaurées.",
      unblockThisHostname_373a1c75: 'Débloquer',
      unblock_712da631: "Débloquer ce nom d'hôte?",
    },
    page: {
      domains_ced67718: 'Domaines',
      searchDomainsInspectTheLinkedTopic_6a8e3d17:
        "Recherchez les domaines, inspectez le sujet lié et votez sur l'autorité du domaine.",
    },
  },
}

export default messages
