import { useAssistants } from '@renderer/hooks/useAssistant'
import LauncherNavigator from '@renderer/pages/home/Tabs/components/LauncherNavigator'
import type { Assistant, Topic } from '@renderer/types'
import { Modal } from 'antd'
import { useCallback, useState } from 'react'

import { TopView } from '../TopView'

interface PopupParams {
  activeAssistant: Assistant
  activeTopic: Topic
  onSelect: (assistant: Assistant, topic: Topic) => void
}

interface PopupContainerProps extends PopupParams {
  resolve: (value: { assistant: Assistant; topic: Topic } | undefined) => void
}

const PopupContainer: React.FC<PopupContainerProps> = ({ activeAssistant, activeTopic, onSelect, resolve }) => {
  const [open, setOpen] = useState(true)
  const [result, setResult] = useState<{ assistant: Assistant; topic: Topic }>()
  const { assistants } = useAssistants()

  const handleClose = useCallback(() => {
    setOpen(false)
  }, [])

  const handleSelect = useCallback(
    (assistant: Assistant, topic: Topic) => {
      const nextResult = { assistant, topic }
      setResult(nextResult)
      onSelect(assistant, topic)
      setOpen(false)
    },
    [onSelect]
  )

  const onAfterClose = useCallback(() => {
    resolve(result)
  }, [resolve, result])

  LauncherPopup.hide = handleClose

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      afterClose={onAfterClose}
      title={null}
      width={760}
      transitionName="animation-move-down"
      centered
      footer={null}
      closable={false}
      styles={{
        content: {
          borderRadius: 20,
          padding: 0,
          overflow: 'hidden'
        },
        body: {
          padding: 0,
          maxHeight: '70vh'
        }
      }}>
      <LauncherNavigator
        assistants={assistants}
        activeAssistant={activeAssistant}
        activeTopic={activeTopic}
        mode="popup"
        onSelect={handleSelect}
        onClose={handleClose}
      />
    </Modal>
  )
}

export default class LauncherPopup {
  static hide() {
    TopView.hide('LauncherPopup')
  }

  static show(params: PopupParams) {
    return new Promise<{ assistant: Assistant; topic: Topic } | undefined>((resolve) => {
      TopView.show(
        <PopupContainer
          {...params}
          resolve={(value) => {
            resolve(value)
            TopView.hide('LauncherPopup')
          }}
        />,
        'LauncherPopup'
      )
    })
  }
}
