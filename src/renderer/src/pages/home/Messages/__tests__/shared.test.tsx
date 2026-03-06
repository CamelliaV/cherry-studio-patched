import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { MessagesContainer, MessagesViewport } from '../shared'

describe('message layout shared containers', () => {
  it('stretches the messages container to fill the viewport', () => {
    render(
      <MessagesViewport data-testid="viewport">
        <MessagesContainer data-testid="messages-container">
          <div>message body</div>
        </MessagesContainer>
        <div data-testid="anchor-line">anchor</div>
      </MessagesViewport>
    )

    const messagesContainer = screen.getByTestId('messages-container')

    expect(messagesContainer).toHaveStyle({ flexGrow: '1' })
    expect(messagesContainer).toHaveStyle({ minHeight: '0' })
  })
})
