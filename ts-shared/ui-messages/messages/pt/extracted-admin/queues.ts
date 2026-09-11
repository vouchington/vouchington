const messages = {
  queues: {
    aiAgentsSection: {
      aiAgentsDisabled_2a397abe: 'Agentes de IA desabilitados',
      aiAgentsEnabled_786b4c72: 'Agentes de IA habilitados',
      aiAgents_d591a7cb: 'Agentes de IA',
      disableAiAgents_2d8b6f04: 'Desabilitar Agentes de IA',
      disabled_75081b59: 'Desabilitado',
      enableAiAgents_4a7c9e13: 'Habilitar Agentes de IA',
      enabled_92c1cdfd: 'Habilitado',
      failedToToggleAiAgents_90820208: 'Falha ao alternar Agentes de IA',
      loading_8c3f5a92: 'Carregando…',
      retryLoadingStatus_50b07fb2: 'Tentar novamente o carregamento do status',
    },
    backfillTriggerDialog: {
      cancel_19766ed6: 'Cancelar',
      runBackfillDescription_502faa6e: 'Executar preenchimento: {description}?',
      runBackfill_625fd5e1: 'Executar Preenchimento',
      thisWillEnqueueAJobnameDispatcher_70b49fc7:
        'Isso enfileirará um trabalho de dispatcher {jobName} que verifica {sourceTable} e enfileira trabalhos individuais para cada linha sem um resultado. Isso pode enfileirar um grande número de trabalhos.',
    },
    backfillsTable: {
      action_64cff131: 'Ação',
      backfills_a48b0e52: 'Preenchimentos',
      description_526e0087: 'Descrição',
      queue_3b2fe03e: 'Fila',
      runBackfill_625fd5e1: 'Executar Preenchimento',
      running_4977a7e5: 'Executando...',
      sourceTable_59462672: 'Tabela de Origem',
    },
    kagiSection: {
      disableKagiSmallweb_4074794b: 'Desabilitar Kagi Smallweb',
      disabled_75081b59: 'Desabilitado',
      enableKagiSmallweb_9708f935: 'Habilitar Kagi Smallweb',
      enabled_92c1cdfd: 'Habilitado',
      failedToToggleKagiSmallweb_57905ab3: 'Falha ao alternar Kagi Smallweb',
      kagiSmallwebDisabled_690e9de0: 'Kagi Smallweb desabilitado',
      kagiSmallwebEnabled_96f7a415: 'Kagi Smallweb habilitado',
      kagiSmallweb_fb55419b: 'Kagi Smallweb',
      loading_ba3bbbe1: 'Carregando…',
      retryLoadingStatus_50b07fb2: 'Tentar novamente o carregamento do status',
    },
    page: {
      backfillDescriptionEnqueued_f822b605: 'Preenchimento "{description}" enfileirado',
      failedToLoadScheduledJobs_196d47c6: 'Falha ao carregar trabalhos agendados',
      failedToTriggerBackfillDescription_677e1efb: 'Falha ao ativar o preenchimento: {description}',
      failedToTriggerDescription_f09acb12: 'Falha ao ativar {description}',
      jobDescriptionTriggered_6a310e54: 'Trabalho {description} acionado',
    },
    scheduledJobTriggerDialog: {
      cancel_19766ed6: 'Cancelar',
      thisWillImmediatelyEnqueueTheJobname_2a41ab47:
        'Isso enfileirará imediatamente o trabalho {jobName} na fila {queueName}. Este trabalho normalmente é executado no cronograma: {schedule}.',
      triggerDescription_b56c1359: 'Ativar {description}?',
      trigger_8b9c6437: 'Ativar',
    },
    scheduledJobsHeader: {
      glideMqJobQueueManagement_4ecf9a0e: 'gerenciamento de fila de trabalhos glide-mq',
      openGlidemqDashboard_d613ee9c: 'Abrir Painel de Controle GlideMQ',
      queues_be77db11: 'Filas',
      refresh_0e916101: 'Atualizar',
      refreshing_69d2daed: 'Atualizando...',
    },
    scheduledJobsLoadState: {
      errorLoadingScheduledJobs_4c9bba2c: 'Erro ao Carregar Trabalhos Agendados',
      loadingScheduledJobs_22dbad5e: 'Carregando trabalhos agendados...',
      queues_be77db11: 'Filas',
    },
    scheduledJobsTable: {
      action_64cff131: 'Ação',
      job_ad617a0f: 'Job',
      queue_3b2fe03e: 'Fila',
      schedule_f4830a1d: 'Cronograma',
      scheduledJobs_63df3f1d: 'Jobs programados',
      trigger_8b9c6437: 'Ativar',
      triggering_b7f2a98c: 'Acionando...',
    },
  },
}

export default messages
