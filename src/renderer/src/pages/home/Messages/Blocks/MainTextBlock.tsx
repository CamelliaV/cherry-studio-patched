import { useSettings } from '@renderer/hooks/useSettings'
import { getModelUniqId } from '@renderer/services/ModelService'
import type { RootState } from '@renderer/store'
import { selectFormattedCitationsByBlockId } from '@renderer/store/messageBlock'
import { type Model } from '@renderer/types'
import type { MainTextMessageBlock, Message } from '@renderer/types/newMessage'
import { determineCitationSource, withCitationTags } from '@renderer/utils/citation'
import { Flex } from 'antd'
import React, { useCallback } from 'react'
import { useSelector } from 'react-redux'
import styled from 'styled-components'

import Markdown from '../../Markdown/Markdown'

interface Props {
  block: MainTextMessageBlock
  citationBlockId?: string
  mentions?: Model[]
  role: Message['role']
}

const LINK_PATTERN = /((?:https?:\/\/|ftp:\/\/|file:\/\/|mailto:|www\.)[^\s<>"'`]+)/gi
const TRAILING_SYMBOL_PATTERN = /[.,!?;:]+$/

const splitTrailingLinkSymbols = (rawMatch: string) => {
  let core = rawMatch
  let trailing = ''

  while (core && TRAILING_SYMBOL_PATTERN.test(core)) {
    const symbol = core.slice(-1)
    core = core.slice(0, -1)
    trailing = symbol + trailing
  }

  while (core.endsWith(')')) {
    const leftBrackets = (core.match(/\(/g) || []).length
    const rightBrackets = (core.match(/\)/g) || []).length
    if (rightBrackets <= leftBrackets) {
      break
    }
    core = core.slice(0, -1)
    trailing = ')' + trailing
  }

  while (core.endsWith(']')) {
    const leftBrackets = (core.match(/\[/g) || []).length
    const rightBrackets = (core.match(/\]/g) || []).length
    if (rightBrackets <= leftBrackets) {
      break
    }
    core = core.slice(0, -1)
    trailing = ']' + trailing
  }

  return { core, trailing }
}

const MainTextBlock: React.FC<Props> = ({ block, citationBlockId, role, mentions = [] }) => {
  // Use the passed citationBlockId directly in the selector
  const { renderInputMessageAsMarkdown } = useSettings()

  const rawCitations = useSelector((state: RootState) => selectFormattedCitationsByBlockId(state, citationBlockId))

  // 创建引用处理函数，传递给 Markdown 组件在流式渲染中使用
  const processContent = useCallback(
    (rawText: string) => {
      if (!block.citationReferences?.length || !citationBlockId || rawCitations.length === 0) {
        return rawText
      }

      // 确定最适合的 source
      const sourceType = determineCitationSource(block.citationReferences)

      return withCitationTags(rawText, rawCitations, sourceType)
    },
    [block.citationReferences, citationBlockId, rawCitations]
  )

  const handleExternalLinkClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    event.preventDefault()
    event.stopPropagation()
    if (window.api.shell?.openExternal) {
      void window.api.shell.openExternal(href)
      return
    }
    if (typeof window.open === 'function') {
      window.open(href, '_blank', 'noopener,noreferrer')
    }
  }, [])

  const renderPlainTextWithLinks = useCallback(
    (content: string) => {
      const nodes: React.ReactNode[] = []
      let cursor = 0
      let match: RegExpExecArray | null

      LINK_PATTERN.lastIndex = 0
      while ((match = LINK_PATTERN.exec(content)) !== null) {
        const [rawMatch] = match
        const matchIndex = match.index

        if (matchIndex > cursor) {
          nodes.push(content.slice(cursor, matchIndex))
        }

        const { core, trailing } = splitTrailingLinkSymbols(rawMatch)
        if (!core) {
          nodes.push(rawMatch)
          cursor = matchIndex + rawMatch.length
          continue
        }

        const href = core.startsWith('www.') ? `https://${core}` : core
        nodes.push(
          <a
            key={`${matchIndex}-${href}`}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="message-plain-link"
            style={{
              textDecoration: 'underline',
              textDecorationStyle: 'dotted',
              textUnderlineOffset: '2px',
              fontWeight: 500
            }}
            onClick={(event) => handleExternalLinkClick(event, href)}>
            {core}
          </a>
        )

        if (trailing) {
          nodes.push(trailing)
        }

        cursor = matchIndex + rawMatch.length
      }

      if (cursor < content.length) {
        nodes.push(content.slice(cursor))
      }

      return nodes.length > 0 ? nodes : content
    },
    [handleExternalLinkClick]
  )

  return (
    <>
      {/* Render mentions associated with the message */}
      {mentions && mentions.length > 0 && (
        <Flex gap="8px" wrap style={{ marginBottom: 10 }}>
          {mentions.map((m) => (
            <MentionTag key={getModelUniqId(m)}>{'@' + m.name}</MentionTag>
          ))}
        </Flex>
      )}
      {role === 'user' && !renderInputMessageAsMarkdown ? (
        <p className="markdown" style={{ whiteSpace: 'pre-wrap' }}>
          {renderPlainTextWithLinks(block.content)}
        </p>
      ) : (
        <Markdown block={block} postProcess={processContent} />
      )}
    </>
  )
}

const MentionTag = styled.span`
  color: var(--color-link);
`

export default React.memo(MainTextBlock)
