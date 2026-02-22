import Scrollbar from '@renderer/components/Scrollbar'
import styled from 'styled-components'

interface ScrollContainerProps {
  $withAnchor?: boolean
}

export const ScrollContainer = styled.div<ScrollContainerProps>`
  display: flex;
  flex-direction: column-reverse;
  padding: ${(props) => (props.$withAnchor ? '10px 58px 20px 10px' : '10px 10px 20px 10px')};
  .multi-select-mode & {
    padding-bottom: 60px;
  }
`

interface ContainerProps {
  $right?: boolean
}

export const MessagesViewport = styled.div`
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
`

export const MessagesContainer = styled(Scrollbar)<ContainerProps>`
  display: flex;
  flex-direction: column-reverse;
  overflow-x: hidden;
  z-index: 1;
  position: relative;
`
