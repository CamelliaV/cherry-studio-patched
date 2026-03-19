import { createSelector } from '@reduxjs/toolkit'
import type { RootState } from '@renderer/store'
import { messageBlocksSelectors } from '@renderer/store/messageBlock'
import type { Message, MessageBlock } from '@renderer/types/newMessage'

type RenderableMessage = Message & { index?: number }

const selectBlockIds = (_state: RootState, blockIds: readonly string[]) => blockIds

const areStringArraysEqual = (previous: readonly string[] = [], next: readonly string[] = []) =>
  previous.length === next.length && previous.every((value, index) => value === next[index])

const areMentionsEqual = (previous: Message['mentions'], next: Message['mentions']) => {
  if (previous === next) {
    return true
  }
  if (!previous || !next || previous.length !== next.length) {
    return false
  }

  return previous.every((model, index) => {
    const nextModel = next[index]
    return model?.id === nextModel?.id && model?.provider === nextModel?.provider
  })
}

export const makeSelectMessageBlocksByIds = () =>
  createSelector([messageBlocksSelectors.selectEntities, selectBlockIds], (blockEntities, blockIds) =>
    blockIds.map((blockId) => blockEntities[blockId]).filter((block): block is MessageBlock => !!block)
  )

export const areMessageBlockListsEqual = (previous: readonly MessageBlock[] = [], next: readonly MessageBlock[] = []) =>
  previous.length === next.length && previous.every((block, index) => block === next[index])

export const isMessageRenderEqual = (previous: RenderableMessage, next: RenderableMessage) => {
  if (previous === next) {
    return true
  }

  return (
    previous.id === next.id &&
    previous.index === next.index &&
    previous.role === next.role &&
    previous.type === next.type &&
    previous.status === next.status &&
    previous.askId === next.askId &&
    previous.useful === next.useful &&
    previous.foldSelected === next.foldSelected &&
    previous.multiModelMessageStyle === next.multiModelMessageStyle &&
    previous.modelId === next.modelId &&
    previous.model?.id === next.model?.id &&
    previous.model?.provider === next.model?.provider &&
    previous.createdAt === next.createdAt &&
    previous.updatedAt === next.updatedAt &&
    previous.metrics === next.metrics &&
    previous.usage === next.usage &&
    areStringArraysEqual(previous.blocks, next.blocks) &&
    areMentionsEqual(previous.mentions, next.mentions)
  )
}

export const areMessagesForRenderEqual = (
  previous: readonly RenderableMessage[] = [],
  next: readonly RenderableMessage[] = []
) => previous.length === next.length && previous.every((message, index) => isMessageRenderEqual(message, next[index]!))
