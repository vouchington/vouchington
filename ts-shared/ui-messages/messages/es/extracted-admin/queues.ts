const messages = {
  queues: {
    aiAgentsSection: {
      aiAgentsDisabled_2a397abe: 'Agentes de IA deshabilitados',
      aiAgentsEnabled_786b4c72: 'Agentes de IA habilitados',
      aiAgents_d591a7cb: 'Agentes de IA',
      disableAiAgents_2d8b6f04: 'Deshabilitar Agentes de IA',
      disabled_75081b59: 'Deshabilitado',
      enableAiAgents_4a7c9e13: 'Habilitar Agentes de IA',
      enabled_92c1cdfd: 'Habilitado',
      failedToToggleAiAgents_90820208: 'No se pudo alternar Agentes de IA',
      loading_8c3f5a92: 'Cargando…',
      retryLoadingStatus_50b07fb2: 'Reintentar carga de estado',
    },
    backfillTriggerDialog: {
      cancel_19766ed6: 'Cancelar',
      runBackfillDescription_502faa6e: '¿Ejecutar relleno: {description}?',
      runBackfill_625fd5e1: 'Ejecutar Relleno',
      thisWillEnqueueAJobnameDispatcher_70b49fc7:
        'Esto encolará un trabajo de distribuidor {jobName} que escanea {sourceTable} y encola trabajos individuales para cada fila sin un resultado. Esto puede encolar una gran cantidad de trabajos.',
    },
    backfillsTable: {
      action_64cff131: 'Acción',
      backfills_a48b0e52: 'Rellenos',
      description_526e0087: 'Descripción',
      queue_3b2fe03e: 'Cola',
      runBackfill_625fd5e1: 'Ejecutar Relleno',
      running_4977a7e5: 'Ejecutando...',
      sourceTable_59462672: 'Tabla de Origen',
    },
    kagiSection: {
      disableKagiSmallweb_4074794b: 'Deshabilitar Kagi Smallweb',
      disabled_75081b59: 'Deshabilitado',
      enableKagiSmallweb_9708f935: 'Habilitar Kagi Smallweb',
      enabled_92c1cdfd: 'Habilitado',
      failedToToggleKagiSmallweb_57905ab3: 'No se pudo alternar Kagi Smallweb',
      kagiSmallwebDisabled_690e9de0: 'Kagi Smallweb deshabilitado',
      kagiSmallwebEnabled_96f7a415: 'Kagi Smallweb habilitado',
      kagiSmallweb_fb55419b: 'Kagi Smallweb',
      loading_ba3bbbe1: 'Cargando…',
      retryLoadingStatus_50b07fb2: 'Reintentar carga de estado',
    },
    page: {
      backfillDescriptionEnqueued_f822b605: 'Relleno "{description}" encolado',
      failedToLoadScheduledJobs_196d47c6: 'No se pudo cargar los trabajos programados',
      failedToTriggerBackfillDescription_677e1efb: 'No se pudo activar el relleno: {description}',
      failedToTriggerDescription_f09acb12: 'No se pudo activar {description}',
      jobDescriptionTriggered_6a310e54: 'Trabajo {description} activado',
    },
    scheduledJobTriggerDialog: {
      cancel_19766ed6: 'Cancelar',
      thisWillImmediatelyEnqueueTheJobname_2a41ab47:
        'Esto encolará inmediatamente el trabajo {jobName} en la cola {queueName}. Este trabajo normalmente se ejecuta en el horario: {schedule}.',
      triggerDescription_b56c1359: '¿Activar {description}?',
      trigger_8b9c6437: 'Activar',
    },
    scheduledJobsHeader: {
      glideMqJobQueueManagement_4ecf9a0e: 'gestión de cola de trabajos glide-mq',
      openGlidemqDashboard_d613ee9c: 'Abrir Panel de Control de GlideMQ',
      queues_be77db11: 'Colas',
      refresh_0e916101: 'Actualizar',
      refreshing_69d2daed: 'Actualizando...',
    },
    scheduledJobsLoadState: {
      errorLoadingScheduledJobs_4c9bba2c: 'Error al Cargar Trabajos Programados',
      loadingScheduledJobs_22dbad5e: 'Cargando trabajos programados...',
      queues_be77db11: 'Colas',
    },
    scheduledJobsTable: {
      action_64cff131: 'Acción',
      job_ad617a0f: 'Trabajo',
      queue_3b2fe03e: 'Cola',
      schedule_f4830a1d: 'Horario',
      scheduledJobs_63df3f1d: 'Trabajos programados',
      trigger_8b9c6437: 'Activar',
      triggering_b7f2a98c: 'Activando...',
    },
  },
}

export default messages
