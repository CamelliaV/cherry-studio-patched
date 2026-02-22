import { QuestionCircleOutlined } from '@ant-design/icons'
import ModelAvatar from '@renderer/components/Avatar/ModelAvatar'
import CodeEditor from '@renderer/components/CodeEditor'
import EditableNumber from '@renderer/components/EditableNumber'
import { DeleteIcon, ResetIcon } from '@renderer/components/Icons'
import { HStack } from '@renderer/components/Layout'
import { SelectModelPopup } from '@renderer/components/Popups/SelectModelPopup'
import Selector from '@renderer/components/Selector'
import { DEFAULT_CONTEXTCOUNT, DEFAULT_TEMPERATURE, MAX_CONTEXT_COUNT } from '@renderer/config/constant'
import { isEmbeddingModel, isRerankModel } from '@renderer/config/models'
import { useModelGroups } from '@renderer/hooks/useProvider'
import { useTimer } from '@renderer/hooks/useTimer'
import { SettingRow } from '@renderer/pages/settings'
import { DEFAULT_ASSISTANT_SETTINGS } from '@renderer/services/AssistantService'
import { resolveAssistantDisplayModel } from '@renderer/services/ModelCandidatesService'
import { getModelUniqId } from '@renderer/services/ModelService'
import type {
  Assistant,
  AssistantModelGroup,
  AssistantSettingCustomParameters,
  AssistantSettings,
  Model,
  ModelGroupRoutingMode
} from '@renderer/types'
import { modalConfirm, uuid } from '@renderer/utils'
import { Button, Col, Divider, Input, InputNumber, Row, Select, Slider, Switch, Tooltip } from 'antd'
import { isNull } from 'lodash'
import { PlusIcon } from 'lucide-react'
import type { FC } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

interface Props {
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => void
  updateAssistantSettings: (settings: Partial<AssistantSettings>) => void
}

const AssistantModelSettings: FC<Props> = ({ assistant, updateAssistant, updateAssistantSettings }) => {
  const [temperature, setTemperature] = useState(assistant?.settings?.temperature ?? DEFAULT_TEMPERATURE)
  const [contextCount, setContextCount] = useState(assistant?.settings?.contextCount ?? DEFAULT_CONTEXTCOUNT)
  const [enableMaxTokens, setEnableMaxTokens] = useState(assistant?.settings?.enableMaxTokens ?? false)
  const [maxTokens, setMaxTokens] = useState(assistant?.settings?.maxTokens ?? 0)
  const [streamOutput, setStreamOutput] = useState(assistant?.settings?.streamOutput)
  const [toolUseMode, setToolUseMode] = useState<AssistantSettings['toolUseMode']>(
    assistant?.settings?.toolUseMode ?? 'function'
  )
  const { modelGroups: globalModelGroups, setModelGroups: setGlobalModelGroups } = useModelGroups()
  const [defaultModel, setDefaultModel] = useState(assistant?.defaultModel)
  const [selectedModelGroupId, setSelectedModelGroupId] = useState<string | undefined>(assistant?.selectedModelGroupId)
  const [modelGroupRoutingMode, setModelGroupRoutingMode] = useState<ModelGroupRoutingMode>(
    assistant?.modelGroupRoutingMode ?? 'order-first'
  )
  const [topP, setTopP] = useState(assistant?.settings?.topP ?? 1)
  const [enableTopP, setEnableTopP] = useState(assistant?.settings?.enableTopP ?? false)
  const [customParameters, setCustomParameters] = useState<AssistantSettingCustomParameters[]>(
    assistant?.settings?.customParameters ?? []
  )
  const [enableTemperature, setEnableTemperature] = useState(assistant?.settings?.enableTemperature ?? false)

  const customParametersRef = useRef(customParameters)

  customParametersRef.current = customParameters

  useEffect(() => {
    setSelectedModelGroupId(assistant?.selectedModelGroupId)
    setModelGroupRoutingMode(assistant?.modelGroupRoutingMode ?? 'order-first')
    setDefaultModel(assistant?.defaultModel)
  }, [assistant?.defaultModel, assistant?.modelGroupRoutingMode, assistant?.selectedModelGroupId])

  const { t } = useTranslation()
  const { setTimeoutTimer } = useTimer()

  const onTemperatureChange = (value) => {
    if (!isNaN(value as number)) {
      updateAssistantSettings({ temperature: value })
    }
  }

  const onContextCountChange = (value) => {
    if (!isNaN(value as number)) {
      updateAssistantSettings({ contextCount: value })
    }
  }

  const onTopPChange = (value) => {
    if (!isNaN(value as number)) {
      updateAssistantSettings({ topP: value })
    }
  }

  const onAddCustomParameter = () => {
    const newParam = { name: '', value: '', type: 'string' as const }
    const newParams = [...customParameters, newParam]
    setCustomParameters(newParams)
    updateAssistantSettings({ customParameters: newParams })
  }

  const onUpdateCustomParameter = (
    index: number,
    field: 'name' | 'value' | 'type',
    value: string | number | boolean | object
  ) => {
    const newParams = [...customParameters]
    if (field === 'type') {
      let defaultValue: any = ''
      switch (value) {
        case 'number':
          defaultValue = 0
          break
        case 'boolean':
          defaultValue = false
          break
        case 'json':
          defaultValue = ''
          break
        default:
          defaultValue = ''
      }
      newParams[index] = {
        ...newParams[index],
        type: value as any,
        value: defaultValue
      }
    } else {
      newParams[index] = { ...newParams[index], [field]: value }
    }
    setCustomParameters(newParams)
  }

  const renderParameterValueInput = (param: (typeof customParameters)[0], index: number) => {
    switch (param.type) {
      case 'number':
        return (
          <InputNumber
            style={{ width: '100%' }}
            value={param.value as number}
            onChange={(value) => onUpdateCustomParameter(index, 'value', value || 0)}
            step={0.01}
          />
        )
      case 'boolean':
        return (
          <Select
            value={param.value as boolean}
            onChange={(value) => onUpdateCustomParameter(index, 'value', value)}
            style={{ width: '100%' }}
            options={[
              { label: 'true', value: true },
              { label: 'false', value: false }
            ]}
          />
        )
      case 'json': {
        const jsonValue = typeof param.value === 'string' ? param.value : JSON.stringify(param.value, null, 2)
        let hasJsonError = false
        if (jsonValue.trim()) {
          try {
            JSON.parse(jsonValue)
          } catch {
            hasJsonError = true
          }
        }
        return (
          <>
            <CodeEditor
              value={jsonValue}
              language="json"
              onChange={(value) => onUpdateCustomParameter(index, 'value', value)}
              expanded={false}
              height="auto"
              maxHeight="200px"
              minHeight="60px"
              options={{ lint: true, lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
              style={{
                borderRadius: 6,
                overflow: 'hidden',
                border: `1px solid ${hasJsonError ? 'var(--color-error)' : 'var(--color-border)'}`
              }}
            />
            {hasJsonError && (
              <div style={{ color: 'var(--color-error)', fontSize: 12, marginTop: 4 }}>
                {t('models.json_parse_error')}
              </div>
            )}
          </>
        )
      }
      default:
        return (
          <Input
            value={param.value as string}
            onChange={(e) => onUpdateCustomParameter(index, 'value', e.target.value)}
          />
        )
    }
  }

  const onDeleteCustomParameter = (index: number) => {
    const newParams = customParameters.filter((_, i) => i !== index)
    setCustomParameters(newParams)
    updateAssistantSettings({ customParameters: newParams })
  }
  const modelFilter = useCallback((model: Model) => !isEmbeddingModel(model) && !isRerankModel(model), [])

  const normalizeModels = useCallback((models: Model[]) => {
    const modelMap = new Map<string, Model>()
    for (const model of models) {
      const uniqId = getModelUniqId(model)
      if (!uniqId) {
        continue
      }
      if (!modelMap.has(uniqId)) {
        modelMap.set(uniqId, model)
      }
    }
    return [...modelMap.values()]
  }, [])

  const normalizeModelGroups = useCallback(
    (groups: AssistantModelGroup[]) => {
      const groupMap = new Map<string, AssistantModelGroup>()
      for (const group of groups) {
        if (!group?.id || groupMap.has(group.id)) {
          continue
        }
        groupMap.set(group.id, {
          ...group,
          name: group.name?.trim() || 'Model Group',
          models: normalizeModels(group.models ?? [])
        })
      }
      return [...groupMap.values()]
    },
    [normalizeModels]
  )

  const modelGroups = useMemo(() => normalizeModelGroups(globalModelGroups), [globalModelGroups, normalizeModelGroups])

  useEffect(() => {
    if (!selectedModelGroupId) {
      return
    }

    if (modelGroups.some((group) => group.id === selectedModelGroupId)) {
      return
    }

    setSelectedModelGroupId(undefined)
    updateAssistant({
      ...assistant,
      selectedModelGroupId: undefined,
      candidateModels: undefined
    })
  }, [assistant, modelGroups, selectedModelGroupId, updateAssistant])

  const persistModelGroups = useCallback(
    (nextGroups: AssistantModelGroup[], nextSelectedGroupId: string | undefined = selectedModelGroupId) => {
      const normalizedGroups = normalizeModelGroups(nextGroups)
      const effectiveSelectedGroupId = normalizedGroups.some((group) => group.id === nextSelectedGroupId)
        ? nextSelectedGroupId
        : undefined

      setGlobalModelGroups(normalizedGroups)
      setSelectedModelGroupId(effectiveSelectedGroupId)

      updateAssistant({
        ...assistant,
        selectedModelGroupId: effectiveSelectedGroupId,
        modelGroupRoutingMode,
        candidateModels: undefined
      })
    },
    [
      assistant,
      modelGroupRoutingMode,
      normalizeModelGroups,
      selectedModelGroupId,
      setGlobalModelGroups,
      updateAssistant
    ]
  )

  const onAddModelGroup = useCallback(() => {
    const nextGroup: AssistantModelGroup = {
      id: uuid(),
      name: `Group ${modelGroups.length + 1}`,
      models: []
    }
    persistModelGroups([...modelGroups, nextGroup])
  }, [modelGroups, persistModelGroups])

  const onUpdateModelGroupName = useCallback(
    (groupId: string, name: string) => {
      const nextGroups = modelGroups.map((group) => (group.id === groupId ? { ...group, name } : group))
      persistModelGroups(nextGroups)
    },
    [modelGroups, persistModelGroups]
  )

  const onRemoveModelGroup = useCallback(
    (groupId: string) => {
      const nextGroups = modelGroups.filter((group) => group.id !== groupId)
      const nextSelectedGroupId = selectedModelGroupId === groupId ? undefined : selectedModelGroupId
      persistModelGroups(nextGroups, nextSelectedGroupId)
    },
    [modelGroups, persistModelGroups, selectedModelGroupId]
  )

  const onAddModelToGroup = useCallback(
    async (groupId: string) => {
      const selectedModel = await SelectModelPopup.show({
        model: defaultModel ?? assistant?.model,
        filter: modelFilter
      })

      if (!selectedModel) {
        return
      }

      const nextGroups = modelGroups.map((group) =>
        group.id === groupId ? { ...group, models: normalizeModels([...(group.models ?? []), selectedModel]) } : group
      )

      persistModelGroups(nextGroups)
    },
    [assistant, defaultModel, modelFilter, modelGroups, normalizeModels, persistModelGroups]
  )

  const onRemoveModelFromGroup = useCallback(
    (groupId: string, model: Model) => {
      const modelUniqId = getModelUniqId(model)
      const nextGroups = modelGroups.map((group) =>
        group.id === groupId
          ? { ...group, models: group.models.filter((groupModel) => getModelUniqId(groupModel) !== modelUniqId) }
          : group
      )
      persistModelGroups(nextGroups)
    },
    [modelGroups, persistModelGroups]
  )

  const onUseSingleModel = useCallback(() => {
    setSelectedModelGroupId(undefined)
    updateAssistant({
      ...assistant,
      selectedModelGroupId: undefined,
      modelGroupRoutingMode,
      candidateModels: undefined
    })
  }, [assistant, modelGroupRoutingMode, updateAssistant])

  const onUseModelGroup = useCallback(
    (groupId: string) => {
      const previewModel = resolveAssistantDisplayModel(
        {
          ...assistant,
          selectedModelGroupId: groupId,
          modelGroupRoutingMode
        },
        defaultModel
      )

      setSelectedModelGroupId(groupId)
      updateAssistant({
        ...assistant,
        model: previewModel ?? assistant.model,
        selectedModelGroupId: groupId,
        modelGroupRoutingMode,
        candidateModels: undefined
      })
    },
    [assistant, defaultModel, modelGroupRoutingMode, updateAssistant]
  )

  const onChangeModelGroupRoutingMode = useCallback(
    (mode: ModelGroupRoutingMode) => {
      setModelGroupRoutingMode(mode)
      updateAssistant({
        ...assistant,
        modelGroupRoutingMode: mode
      })
    },
    [assistant, updateAssistant]
  )

  const onReset = () => {
    setTemperature(DEFAULT_ASSISTANT_SETTINGS.temperature)
    setEnableTemperature(DEFAULT_ASSISTANT_SETTINGS.enableTemperature ?? false)
    setContextCount(DEFAULT_ASSISTANT_SETTINGS.contextCount)
    setEnableMaxTokens(DEFAULT_ASSISTANT_SETTINGS.enableMaxTokens ?? false)
    setMaxTokens(DEFAULT_ASSISTANT_SETTINGS.maxTokens ?? 0)
    setStreamOutput(DEFAULT_ASSISTANT_SETTINGS.streamOutput)
    setTopP(DEFAULT_ASSISTANT_SETTINGS.topP)
    setEnableTopP(DEFAULT_ASSISTANT_SETTINGS.enableTopP ?? false)
    setCustomParameters(DEFAULT_ASSISTANT_SETTINGS.customParameters ?? [])
    setToolUseMode(DEFAULT_ASSISTANT_SETTINGS.toolUseMode)
    updateAssistantSettings(DEFAULT_ASSISTANT_SETTINGS)
  }

  const onSelectModel = useCallback(async () => {
    const currentModel = defaultModel ? assistant?.model : undefined
    const selectedModel = await SelectModelPopup.show({ model: currentModel, filter: modelFilter })
    if (selectedModel) {
      setDefaultModel(selectedModel)
      setSelectedModelGroupId(undefined)
      updateAssistant({
        ...assistant,
        model: selectedModel,
        defaultModel: selectedModel,
        selectedModelGroupId: undefined,
        candidateModels: undefined
      })
      // TODO: 需要根据配置来设置默认值
      if (selectedModel.name.includes('kimi-k2')) {
        setTemperature(0.6)
        setTimeoutTimer('onSelectModel_1', () => updateAssistantSettings({ temperature: 0.6 }), 500)
      } else if (selectedModel.name.includes('moonshot')) {
        setTemperature(0.3)
        setTimeoutTimer('onSelectModel_2', () => updateAssistantSettings({ temperature: 0.3 }), 500)
      }
    }
  }, [assistant, defaultModel, modelFilter, setTimeoutTimer, updateAssistant, updateAssistantSettings])

  useEffect(() => {
    return () => updateAssistantSettings({ customParameters: customParametersRef.current })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const formatSliderTooltip = (value?: number) => {
    if (value === undefined) return ''
    return value.toString()
  }

  return (
    <Container>
      <HStack alignItems="center" justifyContent="space-between" style={{ marginBottom: 10 }}>
        <Label>{t('assistants.settings.default_model')}</Label>
        <HStack alignItems="center" gap={5}>
          <ModelSelectButton
            icon={defaultModel ? <ModelAvatar model={defaultModel} size={20} /> : <PlusIcon size={18} />}
            onClick={onSelectModel}>
            <ModelName>{defaultModel ? defaultModel.name : t('assistants.presets.edit.model.select.title')}</ModelName>
          </ModelSelectButton>
          {defaultModel && (
            <Button
              color="danger"
              variant="filled"
              icon={<DeleteIcon size={14} className="lucide-custom" />}
              onClick={() => {
                setDefaultModel(undefined)
                updateAssistant({ ...assistant, defaultModel: undefined })
              }}
              danger
            />
          )}
        </HStack>
      </HStack>
      <SettingRow style={{ minHeight: 30 }}>
        <Label>Model Source</Label>
        <Selector
          value={selectedModelGroupId ? `group:${selectedModelGroupId}` : 'model'}
          options={[
            { label: 'Single Model', value: 'model' },
            ...modelGroups.map((group) => ({
              label: `Group: ${group.name}`,
              value: `group:${group.id}`
            }))
          ]}
          onChange={(value) => {
            if (value === 'model') {
              onUseSingleModel()
              return
            }
            if (typeof value === 'string' && value.startsWith('group:')) {
              onUseModelGroup(value.replace('group:', ''))
            }
          }}
          size={14}
        />
      </SettingRow>
      <SettingRow style={{ minHeight: 30 }}>
        <Label>Group Routing</Label>
        <Selector
          value={modelGroupRoutingMode}
          options={[
            { label: 'Order First (failover)', value: 'order-first' },
            { label: 'Round Robin', value: 'round-robin' }
          ]}
          onChange={(value) => onChangeModelGroupRoutingMode(value as ModelGroupRoutingMode)}
          size={14}
        />
      </SettingRow>
      <SettingRow style={{ minHeight: 30 }}>
        <Label>Model Groups</Label>
        <Button icon={<PlusIcon size={18} />} onClick={onAddModelGroup}>
          Add Group
        </Button>
      </SettingRow>
      {modelGroups.length > 0 && (
        <ModelGroupList>
          {modelGroups.map((group) => (
            <ModelGroupCard key={group.id}>
              <ModelGroupHeader>
                <Input
                  value={group.name}
                  onChange={(event) => onUpdateModelGroupName(group.id, event.target.value)}
                  placeholder="Group Name"
                  size="small"
                />
                <HStack alignItems="center" gap={6}>
                  <Button
                    type={selectedModelGroupId === group.id ? 'primary' : 'default'}
                    size="small"
                    onClick={() => onUseModelGroup(group.id)}>
                    Use
                  </Button>
                  <Button size="small" icon={<PlusIcon size={14} />} onClick={() => onAddModelToGroup(group.id)}>
                    Add Model
                  </Button>
                  <Button
                    color="danger"
                    variant="filled"
                    size="small"
                    icon={<DeleteIcon size={14} className="lucide-custom" />}
                    onClick={() => onRemoveModelGroup(group.id)}
                  />
                </HStack>
              </ModelGroupHeader>
              {group.models.length > 0 ? (
                <CandidateList>
                  {group.models.map((groupModel) => (
                    <CandidateRow key={getModelUniqId(groupModel) ?? `${groupModel.provider}-${groupModel.id}`}>
                      <HStack alignItems="center" gap={8} style={{ minWidth: 0 }}>
                        <ModelAvatar model={groupModel} size={18} />
                        <ModelName>{groupModel.name}</ModelName>
                      </HStack>
                      <Button
                        color="danger"
                        variant="filled"
                        size="small"
                        icon={<DeleteIcon size={14} className="lucide-custom" />}
                        onClick={() => onRemoveModelFromGroup(group.id, groupModel)}
                      />
                    </CandidateRow>
                  ))}
                </CandidateList>
              ) : (
                <ModelGroupHint>No models in this group.</ModelGroupHint>
              )}
            </ModelGroupCard>
          ))}
        </ModelGroupList>
      )}
      <Divider style={{ margin: '10px 0' }} />

      <SettingRow style={{ minHeight: 30 }}>
        <HStack alignItems="center">
          <Label>
            {t('chat.settings.temperature.label')}
            <Tooltip title={t('chat.settings.temperature.tip')}>
              <QuestionIcon />
            </Tooltip>
          </Label>
        </HStack>
        <Switch
          checked={enableTemperature}
          onChange={(enabled) => {
            setEnableTemperature(enabled)
            updateAssistantSettings({ enableTemperature: enabled })
          }}
        />
      </SettingRow>
      {enableTemperature && (
        <Row align="middle" gutter={12}>
          <Col span={20}>
            <Slider
              min={0}
              max={2}
              onChange={setTemperature}
              onChangeComplete={onTemperatureChange}
              value={typeof temperature === 'number' ? temperature : 0}
              marks={{ 0: '0', 0.7: '0.7', 2: '2' }}
              step={0.01}
            />
          </Col>
          <Col span={4}>
            <EditableNumber
              min={0}
              max={2}
              step={0.01}
              value={temperature}
              changeOnBlur
              onChange={(value) => {
                if (!isNull(value)) {
                  setTemperature(value)
                  setTimeoutTimer('temperature_onChange', () => updateAssistantSettings({ temperature: value }), 500)
                }
              }}
              style={{ width: '100%' }}
            />
          </Col>
        </Row>
      )}
      <Divider style={{ margin: '10px 0' }} />

      <SettingRow style={{ minHeight: 30 }}>
        <HStack alignItems="center">
          <Label>{t('chat.settings.top_p.label')}</Label>
          <Tooltip title={t('chat.settings.top_p.tip')}>
            <QuestionIcon />
          </Tooltip>
        </HStack>
        <Switch
          checked={enableTopP}
          onChange={(enabled) => {
            setEnableTopP(enabled)
            updateAssistantSettings({ enableTopP: enabled })
          }}
        />
      </SettingRow>
      {enableTopP && (
        <Row align="middle" gutter={12}>
          <Col span={20}>
            <Slider
              min={0}
              max={1}
              onChange={setTopP}
              onChangeComplete={onTopPChange}
              value={typeof topP === 'number' ? topP : 1}
              marks={{ 0: '0', 1: '1' }}
              step={0.01}
            />
          </Col>
          <Col span={4}>
            <EditableNumber
              min={0}
              max={1}
              step={0.01}
              value={topP}
              changeOnBlur
              onChange={(value) => {
                if (!isNull(value)) {
                  setTopP(value)
                  setTimeoutTimer('topP_onChange', () => updateAssistantSettings({ topP: value }), 500)
                }
              }}
              style={{ width: '100%' }}
            />
          </Col>
        </Row>
      )}
      <Divider style={{ margin: '10px 0' }} />

      <Row align="middle">
        <Col span={20}>
          <Label>
            {t('chat.settings.context_count.label')}{' '}
            <Tooltip title={t('chat.settings.context_count.tip')}>
              <QuestionIcon />
            </Tooltip>
          </Label>
        </Col>
        <Col span={4}>
          <EditableNumber
            min={0}
            max={MAX_CONTEXT_COUNT}
            step={1}
            value={contextCount}
            changeOnBlur
            onChange={(value) => {
              if (!isNull(value)) {
                setContextCount(value)
                setTimeoutTimer('contextCount_onChange', () => updateAssistantSettings({ contextCount: value }), 500)
              }
            }}
            formatter={(value) => (value === MAX_CONTEXT_COUNT ? t('chat.settings.max') : (value ?? ''))}
            style={{ width: '100%' }}
          />
        </Col>
      </Row>
      <Row align="middle" gutter={24}>
        <Col span={24}>
          <ContextSliderWrapper>
            <Slider
              min={0}
              max={MAX_CONTEXT_COUNT}
              onChange={setContextCount}
              onChangeComplete={onContextCountChange}
              value={typeof contextCount === 'number' ? contextCount : 0}
              marks={{
                0: '0',
                25: '25',
                50: '50',
                75: '75',
                100: <span style={{ position: 'absolute', right: -2 }}>{t('chat.settings.max')}</span>
              }}
              step={1}
              tooltip={{ formatter: formatSliderTooltip, open: false }}
            />
          </ContextSliderWrapper>
        </Col>
      </Row>
      <Divider style={{ margin: '10px 0' }} />
      <SettingRow style={{ minHeight: 30 }}>
        <HStack alignItems="center">
          <Label>{t('chat.settings.max_tokens.label')}</Label>
          <Tooltip title={t('chat.settings.max_tokens.tip')}>
            <QuestionIcon />
          </Tooltip>
        </HStack>
        <Switch
          checked={enableMaxTokens}
          onChange={async (enabled) => {
            if (enabled) {
              const confirmed = await modalConfirm({
                title: t('chat.settings.max_tokens.confirm'),
                content: t('chat.settings.max_tokens.confirm_content'),
                okButtonProps: {
                  danger: true
                }
              })
              if (!confirmed) return
            }

            setEnableMaxTokens(enabled)
            updateAssistantSettings({ enableMaxTokens: enabled })
          }}
        />
      </SettingRow>
      {enableMaxTokens && (
        <Row align="middle" style={{ marginTop: 5, marginBottom: 5 }}>
          <Col span={24}>
            <InputNumber
              disabled={!enableMaxTokens}
              min={0}
              max={10000000}
              step={100}
              value={maxTokens}
              changeOnBlur
              onChange={(value) => {
                if (!isNull(value)) {
                  setMaxTokens(value)
                  setTimeoutTimer('maxTokens_onChange', () => updateAssistantSettings({ maxTokens: value }), 1000)
                }
              }}
              style={{ width: '100%' }}
            />
          </Col>
        </Row>
      )}
      <Divider style={{ margin: '10px 0' }} />
      <SettingRow style={{ minHeight: 30 }}>
        <Label>{t('models.stream_output')}</Label>
        <Switch
          checked={streamOutput}
          onChange={(checked) => {
            setStreamOutput(checked)
            updateAssistantSettings({ streamOutput: checked })
          }}
        />
      </SettingRow>
      <Divider style={{ margin: '10px 0' }} />
      <SettingRow style={{ minHeight: 30 }}>
        <Label>{t('assistants.settings.tool_use_mode.label')}</Label>
        <Selector
          value={toolUseMode}
          options={[
            { label: t('assistants.settings.tool_use_mode.prompt'), value: 'prompt' },
            { label: t('assistants.settings.tool_use_mode.function'), value: 'function' }
          ]}
          onChange={(value) => {
            setToolUseMode(value)
            updateAssistantSettings({ toolUseMode: value })
          }}
          size={14}
        />
      </SettingRow>
      <Divider style={{ margin: '10px 0' }} />
      <SettingRow style={{ minHeight: 30 }}>
        <Label>{t('models.custom_parameters')}</Label>
        <Button icon={<PlusIcon size={18} />} onClick={onAddCustomParameter}>
          {t('models.add_parameter')}
        </Button>
      </SettingRow>
      {customParameters.map((param, index) => (
        <div key={index} style={{ marginTop: 10 }}>
          <Row align="stretch" gutter={10}>
            <Col span={6}>
              <Input
                placeholder={t('models.parameter_name')}
                value={param.name}
                onChange={(e) => onUpdateCustomParameter(index, 'name', e.target.value)}
              />
            </Col>
            <Col span={6}>
              <Select
                value={param.type}
                onChange={(value) => onUpdateCustomParameter(index, 'type', value)}
                style={{ width: '100%' }}>
                <Select.Option value="string">{t('models.parameter_type.string')}</Select.Option>
                <Select.Option value="number">{t('models.parameter_type.number')}</Select.Option>
                <Select.Option value="boolean">{t('models.parameter_type.boolean')}</Select.Option>
                <Select.Option value="json">{t('models.parameter_type.json')}</Select.Option>
              </Select>
            </Col>
            {param.type !== 'json' && <Col span={10}>{renderParameterValueInput(param, index)}</Col>}
            <Col span={param.type === 'json' ? 12 : 2} style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                color="danger"
                variant="filled"
                icon={<DeleteIcon size={14} className="lucide-custom" />}
                onClick={() => onDeleteCustomParameter(index)}
              />
            </Col>
          </Row>
          {param.type === 'json' && <div style={{ marginTop: 6 }}>{renderParameterValueInput(param, index)}</div>}
        </div>
      ))}
      <Divider style={{ margin: '15px 0' }} />
      <HStack justifyContent="flex-end">
        <Button onClick={onReset} danger type="primary" icon={<ResetIcon size={16} />}>
          {t('chat.settings.reset')}
        </Button>
      </HStack>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 5px;
`

const Label = styled.p`
  margin-right: 5px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
`

const QuestionIcon = styled(QuestionCircleOutlined)`
  font-size: 12px;
  cursor: pointer;
  color: var(--color-text-3);
`

const ModelSelectButton = styled(Button)`
  max-width: 300px;
  justify-content: flex-start;

  .ant-btn-icon {
    flex-shrink: 0;
  }
`

const ModelName = styled.span`
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
`

const CandidateList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
`

const CandidateRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 32px;
`

const ModelGroupList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
`

const ModelGroupCard = styled.div`
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 10px;
`

const ModelGroupHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;

  .ant-input {
    flex: 1;
  }
`

const ModelGroupHint = styled.div`
  color: var(--color-text-2);
  font-size: 12px;
  margin-top: 8px;
`

const ContextSliderWrapper = styled.div`
  padding-bottom: 5px;
`

export default AssistantModelSettings
