interface ConversationContentPendingParams {
  messagesLoaded: boolean
  isLoading: boolean
}

export const shouldShowConversationContentPending = ({ messagesLoaded, isLoading }: ConversationContentPendingParams) =>
  !messagesLoaded && isLoading
