import { loggerService } from '@logger'
import store from '@renderer/store'
import type { Assistant, AssistantModelGroup, Model, ModelGroupRoutingMode, Provider } from '@renderer/types'
import { NOT_SUPPORT_API_KEY_PROVIDER_TYPES, NOT_SUPPORT_API_KEY_PROVIDERS } from '@renderer/utils/provider'

import { getModelUniqId } from './ModelService'

const logger = loggerService.withContext('ModelCandidatesService')

const roundRobinCursorByGroup = new Map<string, number>()

const hasModelIdentity = (model?: Model): model is Model => !!(model?.id && model?.provider)

const uniqModels = (models: Model[]): Model[] => {
  const uniq = new Map<string, Model>()
  for (const model of models) {
    const key = getModelUniqId(model)
    if (!key) continue
    if (!uniq.has(key)) {
      uniq.set(key, model)
    }
  }
  return [...uniq.values()]
}

const normalizeModelGroups = (groups: AssistantModelGroup[] | undefined): AssistantModelGroup[] => {
  if (!Array.isArray(groups)) {
    return []
  }

  const seen = new Set<string>()
  const normalized: AssistantModelGroup[] = []

  for (const group of groups) {
    if (!group?.id || seen.has(group.id)) {
      continue
    }

    normalized.push({
      id: group.id,
      name: group.name?.trim() || 'Model Group',
      models: uniqModels((group.models ?? []).filter(hasModelIdentity))
    })
    seen.add(group.id)
  }

  return normalized
}

const getGroupRoutingMode = (assistant: Assistant): ModelGroupRoutingMode => {
  return assistant.modelGroupRoutingMode ?? 'order-first'
}

const providerSupportsEmptyApiKey = (provider: Provider): boolean => {
  return (
    NOT_SUPPORT_API_KEY_PROVIDERS.includes(provider.id as (typeof NOT_SUPPORT_API_KEY_PROVIDERS)[number]) ||
    NOT_SUPPORT_API_KEY_PROVIDER_TYPES.includes(provider.type as (typeof NOT_SUPPORT_API_KEY_PROVIDER_TYPES)[number])
  )
}

const isProviderAccessible = (provider: Provider | undefined): boolean => {
  if (!provider || provider.enabled === false) {
    return false
  }

  if (provider.authType === 'oauth' && provider.isAuthed) {
    return true
  }

  if (providerSupportsEmptyApiKey(provider)) {
    return true
  }

  return Boolean(provider.apiKey?.trim())
}

const isModelAccessible = (model: Model): boolean => {
  const providers = store.getState().llm.providers
  const provider = providers.find((item) => item.id === model.provider)
  return isProviderAccessible(provider)
}

const getFirstAccessibleModel = (models: Model[]): Model | undefined => {
  const accessible = models.find((model) => isModelAccessible(model))
  if (accessible) {
    return accessible
  }
  return models.find(hasModelIdentity)
}

const getGlobalModelGroups = (): AssistantModelGroup[] => {
  const state = store.getState()
  return normalizeModelGroups(state.llm.modelGroups)
}

export const getAssistantModelGroups = (assistant: Assistant): AssistantModelGroup[] => {
  const globalGroups = getGlobalModelGroups()
  if (globalGroups.length > 0) {
    return globalGroups
  }
  return normalizeModelGroups(assistant.modelGroups)
}

export const getAssistantSelectedModelGroup = (assistant: Assistant): AssistantModelGroup | undefined => {
  if (!assistant.selectedModelGroupId) {
    return undefined
  }

  return getAssistantModelGroups(assistant).find((group) => group.id === assistant.selectedModelGroupId)
}

export const getAssistantModelQueueConcurrency = (assistant: Assistant): number => {
  void assistant
  return 1
}

export const resolveAssistantDisplayModel = (assistant?: Assistant, fallbackModel?: Model): Model | undefined => {
  if (!assistant) {
    return fallbackModel
  }

  const selectedGroup = getAssistantSelectedModelGroup(assistant)
  if (selectedGroup?.models?.length) {
    return getFirstAccessibleModel(selectedGroup.models)
  }

  if (hasModelIdentity(assistant.model)) {
    return assistant.model
  }

  if (hasModelIdentity(assistant.defaultModel)) {
    return assistant.defaultModel
  }

  return fallbackModel
}

export const selectAssistantModelForRequest = (assistant: Assistant): Model | undefined => {
  const selectedGroup = getAssistantSelectedModelGroup(assistant)
  if (!selectedGroup || selectedGroup.models.length === 0) {
    return resolveAssistantDisplayModel(assistant)
  }

  const validModels = selectedGroup.models.filter(hasModelIdentity)
  if (validModels.length === 0) {
    return resolveAssistantDisplayModel(assistant)
  }

  if (getGroupRoutingMode(assistant) === 'round-robin') {
    const pool = validModels.filter((model) => isModelAccessible(model))
    const targets = pool.length > 0 ? pool : validModels
    const cursorKey = `${assistant.id}:${selectedGroup.id}`
    const cursor = roundRobinCursorByGroup.get(cursorKey) ?? 0
    const picked = targets[cursor % targets.length]
    roundRobinCursorByGroup.set(cursorKey, cursor + 1)
    return picked
  }

  const fallback = getFirstAccessibleModel(validModels)
  if (!fallback) {
    logger.warn('Selected model group has no valid model, falling back to assistant model.', {
      assistantId: assistant.id,
      groupId: selectedGroup.id
    })
  }
  return fallback ?? resolveAssistantDisplayModel(assistant)
}
