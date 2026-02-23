import ModelAvatar from '@renderer/components/Avatar/ModelAvatar'
import { SelectModelPopup } from '@renderer/components/Popups/SelectModelPopup'
import { isLocalAi } from '@renderer/config/env'
import { isEmbeddingModel, isRerankModel, isWebSearchModel } from '@renderer/config/models'
import { useAssistant } from '@renderer/hooks/useAssistant'
import { useModelGroups, useProvider } from '@renderer/hooks/useProvider'
import AssistantSettingsPopup from '@renderer/pages/settings/AssistantSettings'
import { resolveAssistantDisplayModel } from '@renderer/services/ModelCandidatesService'
import { getProviderName } from '@renderer/services/ProviderService'
import type { Assistant, Model } from '@renderer/types'
import type { MenuProps } from 'antd'
import { Button, Dropdown, Tag } from 'antd'
import { ChevronsUpDown } from 'lucide-react'
import type { FC } from 'react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

interface Props {
  assistant: Assistant
}

const SelectModelButton: FC<Props> = ({ assistant }) => {
  const { model, updateAssistant } = useAssistant(assistant.id)
  const { t } = useTranslation()
  const timerRef = useRef<NodeJS.Timeout>(undefined)
  const { provider } = useProvider(model?.provider)
  const { modelGroups: globalModelGroups } = useModelGroups()
  const modelGroups = useMemo(
    () => (globalModelGroups.length > 0 ? globalModelGroups : (assistant.modelGroups ?? [])),
    [assistant.modelGroups, globalModelGroups]
  )
  const selectedModelGroup = useMemo(
    () => modelGroups.find((group) => group.id === assistant.selectedModelGroupId),
    [assistant.selectedModelGroupId, modelGroups]
  )

  const modelFilter = (model: Model) => !isEmbeddingModel(model) && !isRerankModel(model)

  const onSelectModel = useCallback(async () => {
    const selectedModel = await SelectModelPopup.show({ model, filter: modelFilter })
    if (selectedModel) {
      // 避免更新数据造成关闭弹框的卡顿
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        const enabledWebSearch = isWebSearchModel(selectedModel)
        updateAssistant({
          ...assistant,
          model: selectedModel,
          selectedModelGroupId: undefined,
          candidateModels: undefined,
          enableWebSearch: enabledWebSearch && assistant.enableWebSearch
        })
      }, 200)
    }
  }, [assistant, model, updateAssistant])

  const onUseModelGroup = useCallback(
    (groupId: string) => {
      const previewModel = resolveAssistantDisplayModel(
        {
          ...assistant,
          selectedModelGroupId: groupId
        },
        model
      )

      updateAssistant({
        ...assistant,
        model: previewModel ?? assistant.model,
        selectedModelGroupId: groupId,
        candidateModels: undefined
      })
    },
    [assistant, model, updateAssistant]
  )

  const onUseSingleModel = useCallback(() => {
    updateAssistant({
      ...assistant,
      selectedModelGroupId: undefined,
      candidateModels: undefined
    })
  }, [assistant, updateAssistant])

  const menuItems = useMemo(() => {
    const items: MenuProps['items'] = [{ key: 'single:select', label: t('button.select_model') }]

    if (modelGroups.length > 0) {
      items.push({ type: 'divider' })
      items.push(
        ...modelGroups.map((group) => ({
          key: `group:${group.id}`,
          label: t('assistants.settings.model_group.option_label', { name: group.name, count: group.models.length }),
          disabled: group.models.length === 0
        }))
      )
    }

    if (assistant.selectedModelGroupId) {
      items.push({ type: 'divider' })
      items.push({ key: 'single:use', label: t('assistants.settings.model_group.use_single_model') })
    }

    items.push({ type: 'divider' })
    items.push({ key: 'group:edit', label: t('assistants.settings.model_group.edit') })

    return items
  }, [assistant.selectedModelGroupId, modelGroups, t])

  const onMenuClick = useCallback(
    async ({ key }: { key: string }) => {
      if (key === 'single:select') {
        await onSelectModel()
        return
      }

      if (key === 'single:use') {
        onUseSingleModel()
        return
      }

      if (key === 'group:edit') {
        await AssistantSettingsPopup.show({ assistant, tab: 'model' })
        return
      }

      if (key.startsWith('group:')) {
        onUseModelGroup(key.replace('group:', ''))
      }
    },
    [assistant, onSelectModel, onUseModelGroup, onUseSingleModel]
  )

  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current)
    }
  }, [])

  if (isLocalAi) {
    return null
  }

  const providerName = getProviderName(model)
  const titleText = selectedModelGroup
    ? t('assistants.settings.model_group.selected_label', { name: selectedModelGroup.name })
    : model?.name || t('button.select_model')
  const suffixText = selectedModelGroup
    ? t('assistants.settings.model_group.count_suffix', { count: selectedModelGroup.models.length })
    : providerName

  return (
    <Dropdown menu={{ items: menuItems, onClick: onMenuClick }} trigger={['click']}>
      <DropdownButton size="small" type="text">
        <ButtonContent>
          <ModelAvatar model={model} size={20} />
          <ModelName>
            {titleText}
            {suffixText ? ` | ${suffixText}` : ''}
          </ModelName>
        </ButtonContent>
        <ChevronsUpDown size={14} color="var(--color-icon)" />
        {!selectedModelGroup && !provider && <Tag color="error">{t('models.invalid_model')}</Tag>}
      </DropdownButton>
    </Dropdown>
  )
}

const DropdownButton = styled(Button)`
  font-size: 11px;
  border-radius: 15px;
  padding: 13px 5px;
  -webkit-app-region: none;
  box-shadow: none;
  background-color: transparent;
  border: 1px solid transparent;
  margin-top: 1px;
`

const ButtonContent = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`

const ModelName = styled.span`
  font-weight: 500;
  margin-right: -2px;
  font-size: 12px;
`

export default SelectModelButton
