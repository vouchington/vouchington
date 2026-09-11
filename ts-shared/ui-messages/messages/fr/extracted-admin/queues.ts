const messages = {
  queues: {
    aiAgentsSection: {
      aiAgentsDisabled_2a397abe: 'Agents IA désactivés',
      aiAgentsEnabled_786b4c72: 'Agents IA activés',
      aiAgents_d591a7cb: "Agents d'IA",
      disableAiAgents_2d8b6f04: 'Désactiver les Agents IA',
      disabled_75081b59: 'Désactivé',
      enableAiAgents_4a7c9e13: 'Activer les Agents IA',
      enabled_92c1cdfd: 'Activé',
      failedToToggleAiAgents_90820208: "Impossible d'activer/désactiver les Agents IA",
      loading_8c3f5a92: 'Chargement…',
      retryLoadingStatus_50b07fb2: 'Réessayer le chargement du statut',
    },
    backfillTriggerDialog: {
      cancel_19766ed6: 'Annuler',
      runBackfillDescription_502faa6e: 'Exécuter le remplissage: {description}?',
      runBackfill_625fd5e1: 'Exécuter le Remplissage',
      thisWillEnqueueAJobnameDispatcher_70b49fc7:
        'Ceci enqueue un travail de dispatcher {jobName} qui analyse {sourceTable} et enqueue les tâches individuelles pour chaque ligne manquant un résultat. Cela peut enqueue un grand nombre de tâches.',
    },
    backfillsTable: {
      action_64cff131: 'Action',
      backfills_a48b0e52: 'Remplissages',
      description_526e0087: 'Description',
      queue_3b2fe03e: 'File',
      runBackfill_625fd5e1: 'Exécuter le Remplissage',
      running_4977a7e5: "En cours d'exécution...",
      sourceTable_59462672: 'Table Source',
    },
    kagiSection: {
      disableKagiSmallweb_4074794b: 'Désactiver Kagi Smallweb',
      disabled_75081b59: 'Désactivé',
      enableKagiSmallweb_9708f935: 'Activer Kagi Smallweb',
      enabled_92c1cdfd: 'Activé',
      failedToToggleKagiSmallweb_57905ab3: "Impossible d'activer/désactiver Kagi Smallweb",
      kagiSmallwebDisabled_690e9de0: 'Kagi Smallweb désactivé',
      kagiSmallwebEnabled_96f7a415: 'Kagi Smallweb activé',
      kagiSmallweb_fb55419b: 'Kagi Smallweb',
      loading_ba3bbbe1: 'Chargement…',
      retryLoadingStatus_50b07fb2: 'Réessayer le chargement du statut',
    },
    page: {
      backfillDescriptionEnqueued_f822b605: 'Remplissage "{description}" enqueued',
      failedToLoadScheduledJobs_196d47c6: 'Impossible de charger les tâches planifiées',
      failedToTriggerBackfillDescription_677e1efb:
        'Impossible de déclencher le remplissage: {description}',
      failedToTriggerDescription_f09acb12: 'Impossible de déclencher {description}',
      jobDescriptionTriggered_6a310e54: 'Tâche {description} déclenchée',
    },
    scheduledJobTriggerDialog: {
      cancel_19766ed6: 'Annuler',
      thisWillImmediatelyEnqueueTheJobname_2a41ab47:
        "Ceci enqueue immédiatement la tâche {jobName} sur la file {queueName}. Cette tâche s'exécute normalement selon le calendrier: {schedule}.",
      triggerDescription_b56c1359: 'Déclencher {description}?',
      trigger_8b9c6437: 'Déclencher',
    },
    scheduledJobsHeader: {
      glideMqJobQueueManagement_4ecf9a0e: "gestion de la file d'attente des tâches glide-mq",
      openGlidemqDashboard_d613ee9c: 'Ouvrir le Tableau de Bord GlideMQ',
      queues_be77db11: "Files d'attente",
      refresh_0e916101: 'Actualiser',
      refreshing_69d2daed: 'Actualisation en cours...',
    },
    scheduledJobsLoadState: {
      errorLoadingScheduledJobs_4c9bba2c: 'Erreur lors du Chargement des Tâches Planifiées',
      loadingScheduledJobs_22dbad5e: 'Chargement des tâches planifiées...',
      queues_be77db11: "Files d'attente",
    },
    scheduledJobsTable: {
      action_64cff131: 'Action',
      job_ad617a0f: 'Travail',
      queue_3b2fe03e: 'File',
      schedule_f4830a1d: 'Calendrier',
      scheduledJobs_63df3f1d: 'Travaux programmés',
      trigger_8b9c6437: 'Déclencher',
      triggering_b7f2a98c: 'Déclenchement...',
    },
  },
}

export default messages
