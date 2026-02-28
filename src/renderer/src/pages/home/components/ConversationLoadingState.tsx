import { motion } from 'motion/react'
import { memo } from 'react'
import styled from 'styled-components'

interface ConversationLoadingStateProps {
  visible: boolean
  backgroundEnabled: boolean
  backgroundOpacity: number
}

const ConversationLoadingState: React.FC<ConversationLoadingStateProps> = ({
  visible,
  backgroundEnabled,
  backgroundOpacity
}) => {
  if (!visible) return null

  return (
    <LoadingContainer
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      $backgroundEnabled={backgroundEnabled}
      $backgroundOpacity={backgroundOpacity}>
      <LoadingContent>
        <MessageSkeleton delay={0} />
        <MessageSkeleton delay={0.1} />
        <MessageSkeleton delay={0.2} />
      </LoadingContent>
    </LoadingContainer>
  )
}

interface MessageSkeletonProps {
  delay: number
}

const MessageSkeleton: React.FC<MessageSkeletonProps> = ({ delay }) => {
  return (
    <SkeletonMessage
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}>
      <SkeletonAvatar />
      <SkeletonContent>
        <SkeletonLine width="60%" />
        <SkeletonLine width="85%" />
        <SkeletonLine width="45%" />
      </SkeletonContent>
    </SkeletonMessage>
  )
}

const LoadingContainer = styled(motion.div)<{ $backgroundEnabled: boolean; $backgroundOpacity: number }>`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: ${(props) => {
    if (props.$backgroundEnabled) {
      // When background is enabled, use the user's opacity setting
      const overlayOpacity = Math.max(0.5, props.$backgroundOpacity * 0.9)
      return `color-mix(in srgb, var(--color-background) ${overlayOpacity * 100}%, transparent)`
    }
    // When no background, use subtle overlay
    return 'color-mix(in srgb, var(--color-background) 85%, transparent)'
  }};
  backdrop-filter: ${(props) => (props.$backgroundEnabled ? 'blur(8px)' : 'blur(4px)')};
  z-index: 4;
  pointer-events: none;
`

const LoadingContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px;
  flex: 1;
  overflow: hidden;
`

const SkeletonMessage = styled(motion.div)`
  display: flex;
  gap: 12px;
  align-items: flex-start;
`

const SkeletonAvatar = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--color-border) 20%, transparent) 0%,
    color-mix(in srgb, var(--color-border) 35%, transparent) 50%,
    color-mix(in srgb, var(--color-border) 20%, transparent) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  flex-shrink: 0;

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`

const SkeletonContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-width: 0;
`

const SkeletonLine = styled.div<{ width: string }>`
  height: 14px;
  width: ${(props) => props.width};
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--color-border) 20%, transparent) 0%,
    color-mix(in srgb, var(--color-border) 35%, transparent) 50%,
    color-mix(in srgb, var(--color-border) 20%, transparent) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`

export default memo(ConversationLoadingState)
