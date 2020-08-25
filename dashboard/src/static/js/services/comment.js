export class CommentService {
  constructor ({ el }) {
    this.el = el
    this.comments = new Map()
    this.styles = ['primary', 'link', 'success', 'info', 'warning', 'danger']
  }

  createElement (text, style) {
    const comment = document.createElement('div')
    comment.classList.add(
      'comment',
      `has-background-${style}-light`,
      `has-text-${style}-dark`
    )
    const content = document.createElement('div')
    content.classList.add('content')
    content.innerHTML = text
    comment.appendChild(content)
    return comment
  }

  add ({ text, style = 'info', wait = 0, timeout = 15000 } = {}) {
    const id = +new Date()
    const comment = this.createElement(text, style)
    this.comments.set(id, comment)
    setTimeout(() => this.el.appendChild(comment), wait)
    if (timeout > 0) {
      setTimeout(() => this.close(id), timeout + wait)
    }
    return id
  }

  queue ({ messages = [], timeout = 15000, wait = 750, style = 'info' } = {}) {
    var timer = timeout + wait
    messages.forEach((msg, index) => {
      const message = typeof msg === 'string' ? { text: msg } : msg
      setTimeout(() => this.add({ style, timeout, ...message }), timer * index)
    })
  }

  close (id) {
    const comment = this.comments.get(id)
    comment.classList.add('closed')
    setTimeout(() => {
      try {
        this.el.removeChild(comment)
      } catch {
        this.comments.delete(id)
      }
    }, 300)
  }

  reset () {
    this.comments.forEach(message => {
      if (message.active) {
        this.close(message)
      }
    })
  }
}
