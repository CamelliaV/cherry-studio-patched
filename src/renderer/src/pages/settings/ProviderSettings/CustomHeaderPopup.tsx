import CodeEditor from '@renderer/components/CodeEditor'
import { TopView } from '@renderer/components/TopView'
import { useCopilot } from '@renderer/hooks/useCopilot'
import { useProvider } from '@renderer/hooks/useProvider'
import type { Provider } from '@renderer/types'
import { CLAUDE_CODE_COMPAT_HEADERS } from '@shared/anthropic'
import { Button, Input, Modal, Space } from 'antd'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SettingHelpText } from '..'

interface ShowParams {
  provider: Provider
}

interface Props extends ShowParams {
  resolve: (data: any) => void
}

const parseHeaderText = (headerText: string) => {
  const parsed = headerText.trim() ? JSON.parse(headerText) : {}
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid headers object')
  }
  return parsed as Record<string, string>
}

const PopupContainer: React.FC<Props> = ({ provider, resolve }) => {
  const [open, setOpen] = useState(true)
  const { t } = useTranslation()
  const { updateProvider } = useProvider(provider.id)
  const { defaultHeaders, updateDefaultHeaders } = useCopilot()

  const headers =
    provider.id === 'copilot'
      ? JSON.stringify(defaultHeaders || {}, null, 2)
      : JSON.stringify(provider.extra_headers || {}, null, 2)

  const [headerText, setHeaderText] = useState<string>(headers)
  const [userAgentOverride, setUserAgentOverride] = useState<string>(() => {
    try {
      const parsedHeaders = parseHeaderText(headers)
      return parsedHeaders['user-agent'] || parsedHeaders['User-Agent'] || ''
    } catch {
      return ''
    }
  })

  const normalizeHeaders = useCallback(
    (headers: Record<string, string>) => {
      const normalizedHeaders = { ...headers }
      delete normalizedHeaders['User-Agent']
      if (userAgentOverride.trim()) {
        normalizedHeaders['user-agent'] = userAgentOverride.trim()
      } else {
        delete normalizedHeaders['user-agent']
      }
      return normalizedHeaders
    },
    [userAgentOverride]
  )

  const onUpdateHeaders = useCallback(() => {
    try {
      const headers = normalizeHeaders(parseHeaderText(headerText))

      if (provider.id === 'copilot') {
        updateDefaultHeaders(headers)
      } else {
        updateProvider({ ...provider, extra_headers: headers })
      }

      window.toast.success(t('message.save.success.title'))
    } catch (error) {
      window.toast.error(t('settings.provider.copilot.invalid_json'))
    }
  }, [headerText, normalizeHeaders, provider, t, updateDefaultHeaders, updateProvider])

  const onApplyClaudeCodeCompatHeaders = useCallback(() => {
    try {
      const mergedHeaders = {
        ...parseHeaderText(headerText),
        ...CLAUDE_CODE_COMPAT_HEADERS
      }
      setHeaderText(JSON.stringify(mergedHeaders, null, 2))
      setUserAgentOverride(CLAUDE_CODE_COMPAT_HEADERS['user-agent'])
    } catch {
      window.toast.error(t('settings.provider.copilot.invalid_json'))
    }
  }, [headerText, t])

  const onOk = () => {
    onUpdateHeaders()
    setOpen(false)
  }

  const onCancel = () => {
    setOpen(false)
  }

  const onClose = () => {
    resolve({})
  }

  CustomHeaderPopup.hide = onCancel

  return (
    <Modal
      title={t('settings.provider.copilot.custom_headers')}
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      afterClose={onClose}
      maskClosable={false}
      transitionName="animation-move-down"
      centered>
      <Space.Compact direction="vertical" style={{ width: '100%', marginTop: 5 }}>
        <SettingHelpText>{t('settings.provider.copilot.headers_description')}</SettingHelpText>
        <Input
          value={userAgentOverride}
          onChange={(e) => setUserAgentOverride(e.target.value)}
          placeholder={t('settings.provider.copilot.user_agent_placeholder')}
          allowClear
        />
        <Space>
          <Button onClick={onApplyClaudeCodeCompatHeaders}>
            {t('settings.provider.copilot.apply_claude_code_compat_headers')}
          </Button>
        </Space>
        <CodeEditor
          value={headerText}
          language="json"
          onChange={(value) => setHeaderText(value)}
          placeholder={`{\n  "Header-Name": "Header-Value"\n}`}
          height="60vh"
          expanded={false}
          wrapped
          options={{
            lint: true,
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
            keymap: true
          }}
        />
      </Space.Compact>
    </Modal>
  )
}

const TopViewKey = 'CustomHeaderPopup'

export default class CustomHeaderPopup {
  static topviewId = 0
  static hide() {
    TopView.hide(TopViewKey)
  }
  static show(props: ShowParams) {
    return new Promise<any>((resolve) => {
      TopView.show(
        <PopupContainer
          {...props}
          resolve={(v) => {
            resolve(v)
            TopView.hide(TopViewKey)
          }}
        />,
        TopViewKey
      )
    })
  }
}
