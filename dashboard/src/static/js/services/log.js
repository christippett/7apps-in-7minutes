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

  createLogRecord (logRecord) {
    const el = document.createElement('p')

    // CSS styles depend on data attributes to colourise log output
    for (const [key, value] of Object.entries(logRecord)) {
      if (key !== 'text') {
        el.setAttribute(`data-${key}`, value)
      }
    }

    // Not all log records refer to a specific id/step
    if (logRecord.step !== null && logRecord.id !== null) {
      const step = document.createElement('span')
      step.setAttribute('class', 'lg-step')
      step.innerText = `Step #${logRecord.step}`.padEnd(8)
      el.appendChild(step)

      const id = document.createElement('span')
      id.setAttribute('class', 'lg-id')
      id.innerText = logRecord.id
      el.appendChild(id)
    }

    // Every log has a text component, otherwise what's the point?
    const message = document.createElement('span')
    message.setAttribute('class', 'lg-text')
    message.innerText = logRecord.text
    el.appendChild(message)

    this.el.appendChild(el)
    this.el.scrollTop = this.el.scrollHeight
  }

  reset () {
    this.el.innerHTML = ''
  }
}
