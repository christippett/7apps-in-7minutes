import utils from '../utils.js'

const PollingStatus = {
  Active: 1,
  Inactive: 0
}

export class ApplicationService {
  constructor ({ apps, notificationService }) {
    this.activePolls = new Map()
    this.apps = new Map()
    apps.map(app => {
      console.debug(`📡 Ground Control to [${app.title}]...`)
      const el = document.getElementById(app.id)
      const iframe = el.getElementsByTagName('iframe')[0]
      this.update({ ...app, el, iframe })
    })

    // Handle IFrame load events
    this.apps.forEach(app =>
      app.iframe.addEventListener('load', event =>
        this.iframeEventHandler({ event, app })
      )
    )
  }

  iframeMessageHandler (event) {
    const timeoutID = event.data.timeoutID
    const app = event.data.app
    if (timeoutID) {
      window.clearTimeout(timeoutID)
    }
    if (app) {
      this.update(app)
    }
  }

  iframeEventHandler ({ event, app }) {
    // Mark app as unavailable if timeout not cleared in time
    const timeoutID = setTimeout(() => {
      app.el.dataset.error = true
    }, 2000)
    const iframe = event.target
    const origin = new URL(iframe.src).origin
    iframe.contentWindow.postMessage({ timeoutID }, origin)
  }

  update (app) {
    const id = app.id

    // Update app and inherit its existing properties
    const oldApp = this.apps.get(id)
    if (oldApp) app = { ...oldApp, ...app }
    app.updated = app.updated ? new Date(app.updated) : new Date()
    this.apps.set(id, app)

    // Update DOM elements that reference app properties
    app.el.dataset.version = app.version
    if (app.el.hasAttribute('data-error')) {
      app.el.removeAttribute('data-error')
    }
    if (oldApp === undefined || app.version !== oldApp.version) {
      app.iframe.setAttribute('name', `${app.id}-${app.version}`)
      app.iframe.setAttribute('src', `${app.url}?ts=${app.updated.getTime()}`)

      if (oldApp !== undefined) {
        // This is a legitimate new version (not triggered by initial page load)
        app.el.classList.add('has-new-version')
        setTimeout(() => app.el.classList.remove('has-new-version'), 3000)
      }
    }
    return app
  }

  async startPoll (version) {
    if (this.pollingStatus === PollingStatus.Active) {
      console.debug('☝️ Poll already in-progress')
      return
    }
    console.log(`🚰 Polling applications for version ${version}`)
    var apps = Array.from(this.apps.keys())
    this.pollingStatus = PollingStatus.Active
    setTimeout(() => (this.pollingStatus = PollingStatus.Inactive), 600 * 1000)
    while (this.pollingStatus === PollingStatus.Active) {
      if (apps.length === 0) {
        console.log(`🛁 All applications updated to version ${version}`)
        this.pollingStatus = PollingStatus.Inactive
        return
      }
      apps.slice(0).forEach(id => {
        const app = this.apps.get(id)
        if (app.version === version) {
          console.log(`🕹️ ${app.title} has updated to version ${version}`)
          apps.splice(apps.indexOf(id), 1)
        } else {
          app.iframe.src = app.iframe.src.split('?')[0] + `?ts=${+new Date()}`
        }
      })
      await utils.sleep(15000)
    }
  }

  async fetchApp (url) {
    // The app is configured to return a copy of its configuration as JSON
    const resp = await window.fetch(url, {
      cache: 'no-cache',
      headers: { Accept: 'application/json' }
    })
    if (!resp.ok) {
      return { error: resp.statusText, app: null }
    }
    const app = await resp.json()
    return { error: null, app }
  }

  async deploy ({ data }) {
    return await window.fetch('/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
  }
}
