import { FILE_TYPE } from '@renderer/types'
import type { FileMessageBlock } from '@renderer/types/newMessage'
import { MessageBlockType } from '@renderer/types/newMessage'
import React from 'react'

import MessageAttachments from '../MessageAttachments'
import MessageVideo from '../MessageVideo'

interface Props {
  block: FileMessageBlock
}

const FileBlock: React.FC<Props> = ({ block }) => {
  if (block.file?.type === FILE_TYPE.VIDEO) {
    return (
      <MessageVideo
        block={{
          ...block,
          type: MessageBlockType.VIDEO,
          filePath: block.file.path,
          metadata: {
            ...block.metadata,
            type: 'video',
            video: {
              path: block.file.path
            }
          }
        }}
      />
    )
  }

  return <MessageAttachments block={block} />
}

export default React.memo(FileBlock)
