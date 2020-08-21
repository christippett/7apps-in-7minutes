export class LogService {
  constructor ({ el, notificationService }) {
    this.el = el
    this.notifier = notificationService
    this.activeSubscription = null
    this.notifier.subscribe('build', message => {
      const status = message.data.status
      if (status === 'finished' && this.activeSubscription !== null) {
        setTimeout(() => {
          this.notifier.unsubscribe(this.activeSubscription)
          console.log(
            `🗞️ Unsubscribed from log stream: ${this.activeSubscription}`
          )
          this.activeSubscription = null
        }, 30000)
      }
    })
  }

  getLogs (buildId) {
    this.reset()
    this.activeSubscription = this.notifier.subscribe('log', message => {
      this.createLogRecord(message.data)
    })
    console.log(`🗞️ Subscribed to log stream: ${this.activeSubscription}`)
  }

  createLogRecord (data) {
    // This function would be a lot simpler if I'd stuck to just showing
    // monospace white text on a black background...
    const el = document.createElement('p')

    // The data attributes are used to apply specific CSS styles based on
    // the log's content
    el.setAttribute('data-id', data.id || '')
    el.setAttribute('data-step', data.step || '')
    if (data.type) {
      el.setAttribute('data-type', data.type.toLowerCase())
    }

    // Add a prefix that highlights the step the log corresponds to
    // e.g. "Step #10 - gae-standard --->"
    if (data.step && data.id) {
      const step = document.createElement('span')
      step.setAttribute('class', 'lg-step')
      step.innerText = `Step #${data.step}`.padEnd(8)
      el.appendChild(step)

      const id = document.createElement('span')
      id.setAttribute('class', 'lg-id')
      id.innerText = data.id
      el.appendChild(id)
    }

    // Every log has a text component, otherwise what's the point?
    const message = document.createElement('span')
    message.setAttribute('class', 'lg-text')
    message.innerText = data.text
    el.appendChild(message)

    this.el.appendChild(el)
    this.el.scrollTop = this.el.scrollHeight
  }

  reset () {
    this.el.innerHTML = ''
  }
}
