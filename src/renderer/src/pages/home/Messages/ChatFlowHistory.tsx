import '@xyflow/react/dist/style.css'

import { RobotOutlined, UserOutlined } from '@ant-design/icons'
import EmojiAvatar from '@renderer/components/Avatar/EmojiAvatar'
import ModelAvatar from '@renderer/components/Avatar/ModelAvatar'
import { getModelLogo, getModelLogoById } from '@renderer/config/models'
import { useTheme } from '@renderer/context/ThemeProvider'
import useAvatar from '@renderer/hooks/useAvatar'
import { useSettings } from '@renderer/hooks/useSettings'
import { useTimer } from '@renderer/hooks/useTimer'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import type { RootState } from '@renderer/store'
import { makeSelectMessagesForTopic } from '@renderer/store/newMessage'
import type { Model } from '@renderer/types'
import type { Message } from '@renderer/types/newMessage'
import { MessageBlockType } from '@renderer/types/newMessage'
import { isEmoji } from '@renderer/utils'
import type { Edge, Node, NodeTypes } from '@xyflow/react'
import { Controls, Handle, MiniMap, ReactFlow, ReactFlowProvider } from '@xyflow/react'
import { Position } from '@xyflow/react'
import { Avatar, Tooltip } from 'antd'
import type { FC } from 'react'
import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSelector } from 'react-redux'
import styled from 'styled-components'

const LAYOUT = {
  verticalGap: 200,
  horizontalGap: 350,
  baseX: 150
} as const

type FlowMessage = {
  id: string
  role: 'user' | 'assistant'
  createdAtMs: number
  content: string
  model?: Model
}

type FlowData = {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

type FlowNodeData = FlowUserNodeData | FlowAssistantNodeData

type FlowUserNodeData = {
  type: 'user'
  userName: string
  content: string
  messageId: string
  userAvatar: string | null
}

type FlowAssistantNodeData = {
  type: 'assistant'
  model: string
  content: string
  messageId: string
  modelId: string
  modelInfo?: Model
}

type FlowNode = Node<FlowNodeData>
type FlowEdge = Edge

interface ChatFlowHistoryProps {
  conversationId?: string
}

const toTimestamp = (time: string): number => {
  const parsed = Date.parse(time)
  return Number.isNaN(parsed) ? 0 : parsed
}

const getMainTextContentFromBlocks = (
  message: Message,
  blockEntities: RootState['messageBlocks']['entities']
): string => {
  if (!message.blocks || message.blocks.length === 0) {
    return ''
  }

  const contents: string[] = []
  for (const blockId of message.blocks) {
    const block = blockEntities[blockId]
    if (block && block.type === MessageBlockType.MAIN_TEXT) {
      contents.push(block.content)
    }
  }

  return contents.join('\n\n')
}

const getAssistantNodeData = (message: FlowMessage, t: (key: string) => string): FlowAssistantNodeData => ({
  type: 'assistant',
  model: message.model?.name || t('chat.history.assistant_node'),
  content: message.content,
  messageId: message.id,
  modelId: message.model?.id || '',
  modelInfo: message.model
})

const buildConversationFlowData = (
  topicId: string | undefined,
  messages: FlowMessage[],
  userName: string,
  userAvatar: string | null,
  t: (key: string) => string
): FlowData => {
  if (!topicId || messages.length === 0) {
    return { nodes: [], edges: [] }
  }

  const userMessages = messages.filter((msg) => msg.role === 'user').sort((a, b) => a.createdAtMs - b.createdAtMs)
  const assistantMessages = messages
    .filter((msg) => msg.role === 'assistant')
    .sort((a, b) => a.createdAtMs - b.createdAtMs)

  if (userMessages.length === 0 && assistantMessages.length === 0) {
    return { nodes: [], edges: [] }
  }

  const nodes: FlowNode[] = []
  const edges: FlowEdge[] = []
  const assistantsByUser = new Map<string, FlowMessage[]>()
  const assignedAssistantIds = new Set<string>()

  // Single linear pass: assign assistant messages into user-time buckets.
  let assistantCursor = 0
  for (let userIndex = 0; userIndex < userMessages.length; userIndex++) {
    const user = userMessages[userIndex]
    const nextUserTime =
      userIndex === userMessages.length - 1 ? Number.POSITIVE_INFINITY : userMessages[userIndex + 1].createdAtMs
    const relatedAssistants: FlowMessage[] = []

    while (
      assistantCursor < assistantMessages.length &&
      assistantMessages[assistantCursor].createdAtMs <= user.createdAtMs
    ) {
      assistantCursor++
    }

    while (
      assistantCursor < assistantMessages.length &&
      assistantMessages[assistantCursor].createdAtMs < nextUserTime
    ) {
      const assistant = assistantMessages[assistantCursor]
      relatedAssistants.push(assistant)
      assignedAssistantIds.add(assistant.id)
      assistantCursor++
    }

    assistantsByUser.set(user.id, relatedAssistants)
  }

  for (let userIndex = 0; userIndex < userMessages.length; userIndex++) {
    const user = userMessages[userIndex]
    const userNodeId = `user-${user.id}`
    const userY = userIndex * LAYOUT.verticalGap * 2
    const relatedAssistants = assistantsByUser.get(user.id) || []

    nodes.push({
      id: userNodeId,
      type: 'custom',
      data: {
        type: 'user',
        userName: userName || t('chat.history.user_node'),
        content: user.content,
        messageId: user.id,
        userAvatar
      },
      position: { x: LAYOUT.baseX, y: userY },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top
    })

    const hasMultiResponses = relatedAssistants.length > 1
    relatedAssistants.forEach((assistant, assistantIndex) => {
      const assistantNodeId = `assistant-${assistant.id}`
      const assistantX = LAYOUT.baseX + (hasMultiResponses ? LAYOUT.horizontalGap * assistantIndex : 0)

      nodes.push({
        id: assistantNodeId,
        type: 'custom',
        data: getAssistantNodeData(assistant, t),
        position: { x: assistantX, y: userY + LAYOUT.verticalGap },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top
      })

      edges.push({
        id: `edge-${userNodeId}-to-${assistantNodeId}`,
        source: userNodeId,
        target: assistantNodeId
      })
    })

    if (userIndex > 0) {
      const previousUser = userMessages[userIndex - 1]
      const previousUserNodeId = `user-${previousUser.id}`
      const previousAssistants = assistantsByUser.get(previousUser.id) || []

      if (previousAssistants.length > 0) {
        previousAssistants.forEach((assistant) => {
          edges.push({
            id: `edge-assistant-${assistant.id}-to-${userNodeId}`,
            source: `assistant-${assistant.id}`,
            target: userNodeId
          })
        })
      } else {
        edges.push({
          id: `edge-${previousUserNodeId}-to-${userNodeId}`,
          source: previousUserNodeId,
          target: userNodeId
        })
      }
    }
  }

  const orphanAssistants = assistantMessages.filter((assistant) => !assignedAssistantIds.has(assistant.id))
  if (orphanAssistants.length > 0) {
    const minY = nodes.length > 0 ? Math.min(...nodes.map((node) => node.position.y)) : 0
    const orphanStartY = minY - LAYOUT.verticalGap * 2

    orphanAssistants.forEach((assistant, index) => {
      const orphanNodeId = `orphan-assistant-${assistant.id}`
      nodes.push({
        id: orphanNodeId,
        type: 'custom',
        data: getAssistantNodeData(assistant, t),
        position: { x: LAYOUT.baseX, y: orphanStartY - index * LAYOUT.verticalGap },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top
      })

      if (index > 0) {
        edges.push({
          id: `edge-orphan-assistant-${orphanAssistants[index - 1].id}-to-${orphanNodeId}`,
          source: `orphan-assistant-${orphanAssistants[index - 1].id}`,
          target: orphanNodeId
        })
      }
    })
  }

  return { nodes, edges }
}

// 定义Tooltip相关样式组件
const TooltipContent = styled.div`
  max-width: 300px;
`

const TooltipTitle = styled.div`
  font-weight: bold;
  margin-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  padding-bottom: 4px;
`

const TooltipBody = styled.div`
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 8px;
  white-space: pre-wrap;
`

const TooltipFooter = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  font-style: italic;
`

const CustomNode: FC<{ data: FlowNodeData }> = ({ data }) => {
  const { t } = useTranslation()
  const { setTimeoutTimer } = useTimer()

  const isUser = data.type === 'user'
  const title = isUser ? data.userName || t('chat.history.user_node') : data.model || t('chat.history.assistant_node')
  const borderColor = isUser ? 'var(--color-icon)' : 'var(--color-primary)'
  const backgroundColor = isUser ? 'rgba(var(--color-info-rgb), 0.03)' : 'rgba(var(--color-primary-rgb), 0.03)'
  const gradientColor = isUser ? 'rgba(var(--color-info-rgb), 0.08)' : 'rgba(var(--color-primary-rgb), 0.08)'

  const avatar = (() => {
    if (isUser) {
      if (data.userAvatar) {
        if (isEmoji(data.userAvatar)) {
          return <EmojiAvatar size={32}>{data.userAvatar}</EmojiAvatar>
        }
        return <Avatar src={data.userAvatar} alt={title} />
      }

      return <Avatar icon={<UserOutlined />} style={{ backgroundColor: 'var(--color-info)' }} />
    }

    if (data.modelInfo) {
      return <ModelAvatar model={data.modelInfo} size={32} />
    }

    if (data.modelId) {
      const modelLogo = getModelLogo(data.modelInfo) ?? getModelLogoById(data.modelId)
      return (
        <Avatar
          src={modelLogo}
          icon={!modelLogo ? <RobotOutlined /> : undefined}
          style={{ backgroundColor: 'var(--color-primary)' }}
        />
      )
    }

    return <Avatar icon={<RobotOutlined />} style={{ backgroundColor: 'var(--color-primary)' }} />
  })()

  const handleNodeClick = () => {
    const customEvent = new CustomEvent('flow-navigate-to-message', {
      detail: {
        messageId: data.messageId,
        modelId: data.type === 'assistant' ? data.modelId : undefined,
        modelName: data.type === 'assistant' ? data.model : undefined,
        nodeType: data.type
      },
      bubbles: true
    })

    document.dispatchEvent(customEvent)

    setTimeoutTimer(
      'handleNodeClick',
      () => {
        EventEmitter.emit(EVENT_NAMES.LOCATE_MESSAGE + ':' + data.messageId)
      },
      250
    )
  }

  const handleStyle = {
    opacity: 0,
    width: '12px',
    height: '12px',
    background: 'transparent',
    border: 'none'
  }

  return (
    <Tooltip
      title={
        <TooltipContent>
          <TooltipTitle>{title}</TooltipTitle>
          <TooltipBody>{data.content}</TooltipBody>
          <TooltipFooter>{t('chat.history.click_to_navigate')}</TooltipFooter>
        </TooltipContent>
      }
      placement="top"
      color="rgba(0, 0, 0, 0.85)"
      mouseEnterDelay={0.3}
      mouseLeaveDelay={0.1}
      destroyOnHidden>
      <CustomNodeContainer
        style={{
          borderColor,
          background: `linear-gradient(135deg, ${backgroundColor} 0%, ${gradientColor} 100%)`,
          boxShadow: `0 4px 10px rgba(0, 0, 0, 0.1), 0 0 0 2px ${borderColor}40`
        }}
        onClick={handleNodeClick}>
        <Handle type="target" position={Position.Top} style={handleStyle} isConnectable={false} />
        <Handle type="target" position={Position.Left} style={handleStyle} isConnectable={false} />

        <NodeHeader>
          <NodeAvatar>{avatar}</NodeAvatar>
          <NodeTitle>{title}</NodeTitle>
        </NodeHeader>
        <NodeContent title={data.content}>{data.content}</NodeContent>

        <Handle type="source" position={Position.Bottom} style={handleStyle} isConnectable={false} />
        <Handle type="source" position={Position.Right} style={handleStyle} isConnectable={false} />
      </CustomNodeContainer>
    </Tooltip>
  )
}

const nodeTypes: NodeTypes = { custom: CustomNode }

const getMiniMapNodeColor = (node: Node): string => {
  const nodeData = node.data as FlowNodeData | undefined
  return nodeData?.type === 'user' ? 'var(--color-info)' : 'var(--color-primary)'
}

const ChatFlowHistory: FC<ChatFlowHistoryProps> = ({ conversationId }) => {
  const { t } = useTranslation()
  const { userName } = useSettings()
  const { settedTheme } = useTheme()
  const userAvatar = useAvatar()
  const topicId = conversationId

  const selectMessagesForCurrentTopic = useMemo(makeSelectMessagesForTopic, [])
  const messages = useSelector((state: RootState) => selectMessagesForCurrentTopic(state, topicId || ''))
  const blockEntities = useSelector((state: RootState) => state.messageBlocks.entities)

  const flowMessages = useMemo<FlowMessage[]>(() => {
    const next: FlowMessage[] = []

    messages.forEach((message: Message) => {
      if (message.role !== 'user' && message.role !== 'assistant') {
        return
      }

      next.push({
        id: message.id,
        role: message.role,
        createdAtMs: toTimestamp(message.createdAt),
        content: getMainTextContentFromBlocks(message, blockEntities),
        model: message.model
      })
    })

    return next
  }, [blockEntities, messages])

  const flowData = useMemo(
    () => buildConversationFlowData(topicId, flowMessages, userName, userAvatar || null, t),
    [flowMessages, topicId, t, userAvatar, userName]
  )

  return (
    <FlowContainer>
      {flowData.nodes.length > 0 ? (
        <ReactFlowProvider>
          <div style={{ width: '100%', height: '100%' }}>
            <ReactFlow
              nodes={flowData.nodes}
              edges={flowData.edges}
              nodeTypes={nodeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              edgesFocusable={true}
              zoomOnDoubleClick={true}
              preventScrolling={true}
              elementsSelectable={true}
              selectNodesOnDrag={false}
              nodesFocusable={true}
              zoomOnScroll={true}
              panOnScroll={false}
              minZoom={0.4}
              maxZoom={1}
              defaultEdgeOptions={defaultEdgeOptions}
              fitView={true}
              fitViewOptions={{
                padding: 0.3,
                includeHiddenNodes: false,
                minZoom: 0.4,
                maxZoom: 1
              }}
              proOptions={{ hideAttribution: true }}
              className="react-flow-container"
              colorMode={settedTheme}>
              <Controls showInteractive={false} />
              <MiniMap nodeStrokeWidth={3} zoomable pannable nodeColor={getMiniMapNodeColor} />
            </ReactFlow>
          </div>
        </ReactFlowProvider>
      ) : (
        <EmptyContainer>
          <EmptyText>{t('chat.history.no_messages')}</EmptyText>
        </EmptyContainer>
      )}
    </FlowContainer>
  )
}

// 统一的边样式
const commonEdgeStyle = {
  stroke: 'var(--color-border)',
  strokeDasharray: '4,4',
  strokeWidth: 2
}

// 统一的边配置
const defaultEdgeOptions = {
  animated: true,
  style: commonEdgeStyle,
  type: 'step',
  markerEnd: undefined,
  zIndex: 5
}

// 样式组件定义
const FlowContainer = styled.div`
  width: 100%;
  height: 100%;
  min-height: 500px;
`

const EmptyContainer = styled.div`
  width: 100%;
  height: 100%;
  min-height: 500px;
  display: flex;
  justify-content: center;
  align-items: center;
  color: var(--color-text-secondary);
`

const EmptyText = styled.div`
  font-size: 16px;
  margin-bottom: 8px;
  font-weight: bold;
`

const CustomNodeContainer = styled.div`
  padding: 12px;
  border-radius: 10px;
  border: 2px solid;
  width: 280px;
  height: 120px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);

  &:hover {
    transform: translateY(-2px);
    box-shadow:
      0 6px 10px rgba(0, 0, 0, 0.1),
      0 0 0 2px ${(props) => props.style?.borderColor || 'var(--color-border)'}80 !important;
    filter: brightness(1.02);
  }

  &:active {
    transform: scale(0.98);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    transition: all 0.1s ease;
  }
`

const NodeHeader = styled.div`
  font-weight: bold;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.2);
  color: var(--color-text);
  display: flex;
  align-items: center;
  min-height: 32px;
`

const NodeAvatar = styled.span`
  margin-right: 10px;
  display: flex;
  align-items: center;

  .ant-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(0, 0, 0, 0.1);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
`

const NodeTitle = styled.span`
  flex: 1;
  font-size: 16px;
  font-weight: bold;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const NodeContent = styled.div`
  margin: 2px 0;
  color: var(--color-text);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  line-height: 1.5;
  word-break: break-word;
  font-size: 14px;
  padding: 3px;
`

export default memo(ChatFlowHistory)
