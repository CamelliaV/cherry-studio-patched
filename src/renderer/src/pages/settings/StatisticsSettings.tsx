import { useTheme } from '@renderer/context/ThemeProvider'
import db from '@renderer/databases'
import { aggregateUsageStatistics } from '@renderer/services/UsageStatisticsService'
import { useAppSelector } from '@renderer/store'
import type { Message } from '@renderer/types/newMessage'
import { Empty } from 'antd'
import dayjs from 'dayjs'
import { useLiveQuery } from 'dexie-react-hooks'
import type { FC } from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

import { SettingContainer, SettingDivider, SettingGroup, SettingTitle } from './index'
import { CollapsibleSettingGroup } from './SettingGroup'

const StatisticsSettings: FC = () => {
  const { t, i18n } = useTranslation()
  const { theme } = useTheme()
  const assistants = useAppSelector((state) => state.assistants.assistants)
  const topics = useLiveQuery(() => db.topics.toArray(), [])

  const numberFormatter = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language])

  const topicMessagesById = useMemo(
    () =>
      (topics ?? []).reduce<Record<string, Message[]>>((map, topic) => {
        map[topic.id] = topic.messages ?? []
        return map
      }, {}),
    [topics]
  )

  const statistics = useMemo(
    () => aggregateUsageStatistics(assistants, topicMessagesById),
    [assistants, topicMessagesById]
  )

  const formatNumber = (value: number) => numberFormatter.format(value)

  const globalCards = [
    {
      label: t('settings.statistics.cards.total_tokens'),
      value: formatNumber(statistics.totalTokens)
    },
    {
      label: t('settings.statistics.cards.prompt_tokens'),
      value: formatNumber(statistics.promptTokens)
    },
    {
      label: t('settings.statistics.cards.completion_tokens'),
      value: formatNumber(statistics.completionTokens)
    },
    {
      label: t('settings.statistics.cards.assistants'),
      value: formatNumber(statistics.assistantCount)
    },
    {
      label: t('settings.statistics.cards.topics'),
      value: formatNumber(statistics.topicCount)
    },
    {
      label: t('settings.statistics.cards.conversations'),
      value: formatNumber(statistics.conversationCount)
    },
    {
      label: t('settings.statistics.cards.messages'),
      value: formatNumber(statistics.messageCount)
    }
  ]

  return (
    <SettingContainer theme={theme}>
      <SettingGroup theme={theme}>
        <SettingTitle>{t('settings.statistics.title')}</SettingTitle>
        <Description>{t('settings.statistics.description')}</Description>
        <SettingDivider />
        <CardGrid>
          {globalCards.map((card) => (
            <Card key={card.label}>
              <CardLabel>{card.label}</CardLabel>
              <CardValue>{card.value}</CardValue>
            </Card>
          ))}
        </CardGrid>
        <LastUpdated>
          {t('settings.statistics.last_updated', {
            time: dayjs(statistics.generatedAt).format('YYYY-MM-DD HH:mm:ss')
          })}
        </LastUpdated>
      </SettingGroup>

      {statistics.assistants.map((assistant) => (
        <CollapsibleSettingGroup
          key={assistant.assistantId}
          title={
            <GroupTitleRow>
              <span>{assistant.assistantName}</span>
              <GroupMeta>
                {t('settings.statistics.assistant_meta', {
                  tokens: formatNumber(assistant.totalTokens),
                  topics: formatNumber(assistant.topicCount),
                  conversations: formatNumber(assistant.conversationCount)
                })}
              </GroupMeta>
            </GroupTitleRow>
          }
          defaultExpanded={false}>
          {assistant.topics.length === 0 && (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('settings.statistics.no_topics')} />
          )}

          {assistant.topics.map((topic) => (
            <TopicSection key={topic.topicId}>
              <TopicHeader>
                <TopicName>{topic.topicName}</TopicName>
                <TopicMeta>
                  {t('settings.statistics.topic_meta', {
                    tokens: formatNumber(topic.totalTokens),
                    conversations: formatNumber(topic.conversationCount),
                    messages: formatNumber(topic.messageCount)
                  })}
                </TopicMeta>
              </TopicHeader>

              {topic.conversations.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('settings.statistics.no_conversations')} />
              ) : (
                <ConversationTable>
                  <ConversationHeader>
                    <span>{t('settings.statistics.columns.conversation')}</span>
                    <span>{t('settings.statistics.columns.total_tokens')}</span>
                    <span>{t('settings.statistics.columns.prompt_tokens')}</span>
                    <span>{t('settings.statistics.columns.completion_tokens')}</span>
                    <span>{t('settings.statistics.columns.messages')}</span>
                    <span>{t('settings.statistics.columns.updated_at')}</span>
                  </ConversationHeader>

                  {topic.conversations.map((conversation) => (
                    <ConversationRow key={conversation.id}>
                      <span>{t('settings.statistics.conversation_label', { index: conversation.index })}</span>
                      <span>{formatNumber(conversation.totalTokens)}</span>
                      <span>{formatNumber(conversation.promptTokens)}</span>
                      <span>{formatNumber(conversation.completionTokens)}</span>
                      <span>{formatNumber(conversation.messageCount)}</span>
                      <span>
                        {conversation.updatedAt ? dayjs(conversation.updatedAt).format('YYYY-MM-DD HH:mm:ss') : '-'}
                      </span>
                    </ConversationRow>
                  ))}
                </ConversationTable>
              )}
            </TopicSection>
          ))}
        </CollapsibleSettingGroup>
      ))}
    </SettingContainer>
  )
}

const Description = styled.div`
  margin-top: 10px;
  color: var(--color-text-3);
  font-size: 12px;
`

const CardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
`

const Card = styled.div`
  border: 0.5px solid var(--color-border);
  border-radius: var(--list-item-border-radius);
  background: var(--color-background);
  padding: 10px;
`

const CardLabel = styled.div`
  font-size: 12px;
  color: var(--color-text-3);
`

const CardValue = styled.div`
  margin-top: 4px;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-1);
`

const LastUpdated = styled.div`
  margin-top: 10px;
  font-size: 12px;
  color: var(--color-text-3);
`

const GroupTitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const GroupMeta = styled.div`
  color: var(--color-text-3);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const TopicSection = styled.div`
  border: 0.5px solid var(--color-border);
  border-radius: var(--list-item-border-radius);
  background: var(--color-background-soft);
  padding: 10px;
  margin-bottom: 10px;
`

const TopicHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
`

const TopicName = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-1);
`

const TopicMeta = styled.div`
  font-size: 12px;
  color: var(--color-text-3);
`

const ConversationTable = styled.div`
  border: 0.5px solid var(--color-border);
  border-radius: var(--list-item-border-radius);
  overflow: hidden;
`

const ConversationHeader = styled.div`
  display: grid;
  grid-template-columns: minmax(120px, 1.3fr) repeat(4, minmax(70px, 1fr)) minmax(160px, 1.4fr);
  gap: 8px;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--color-text-3);
  background: var(--color-background-mute);
`

const ConversationRow = styled.div`
  display: grid;
  grid-template-columns: minmax(120px, 1.3fr) repeat(4, minmax(70px, 1fr)) minmax(160px, 1.4fr);
  gap: 8px;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--color-text-1);
  border-top: 0.5px solid var(--color-border);
`

export default StatisticsSettings
