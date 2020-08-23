import utils from '../utils.js'

export class ApplicationService {
  constructor ({ apps, notificationService }) {
    this.activePolls = new Map()
    this.apps = new Map()
    apps.map(app => {
      const el = document.getElementById(app.id)
      const iframe = el.getElementsByTagName('iframe')[0]
      this.updateAppInfo({ ...app, el, iframe })
    })
    apps.map(app =>
      app.iframe.addEventListener('load', event =>
        this.iframeEventHandler({ event, app })
      )
    )

    // The backend is responsible for polling each app to check if and when
    // they're updated to a new version. When a new version is detected, the
    // backend sends a message to every client so they can refresh and show the
    // new version
    notificationService.subscribe('refresh-app', message => {
      const { version, app, duration } = message.data
      this.refreshApp({ version, app, duration })
    })
  }

  iframeMessageHandler (event) {
    const timeoutID = event.data.timeoutID
    const app = event.data.app
    if (timeoutID) {
      window.clearTimeout(timeoutID)
    }
    if (app) {
      this.updateAppInfo(app)
    }
  }

  iframeEventHandler ({ event, app }) {
    // Mark app as unavailable if timeout not cleared in time
    const timeoutID = setTimeout(() => {
      app.el.dataset.error = true
    }, 2000)
    const iframe = event.target
    const origin = new URL(iframe.src).origin
    console.log(
      `📡 Ground Control to '${app.title}'. Commencing countdown... engines on!`
    )
    iframe.contentWindow.postMessage({ timeoutID }, origin)
  }

  updateAppInfo (app) {
    const id = app.id
    const oldApp = this.apps.get(id)
    if (oldApp) {
      app = { ...oldApp, ...app }
    }
    // Use provided timestamp if available, otherwise set to now
    app.updated = app.updated ? new Date(app.updated) : new Date()
    this.apps.set(id, app)
    app.el.dataset.version = app.version
    if (app.el.hasAttribute('data')) {
      app.el.removeAttribute('data')
    }
    if (oldApp === undefined || app.version !== oldApp.version) {
      app.iframe.setAttribute('name', `${app.id}-${app.version}`)
      app.iframe.setAttribute('src', `${app.url}?ts=${app.updated.getTime()}`)
      if (oldApp) {
        app.el.classList.add('has-new-version')
        setTimeout(() => app.el.classList.remove('has-new-version'), 3000)
      }
    }
    return app
  }

  async refreshApp (event) {
    // Rather than having every client poll each app separately, the backend
    // takes care of this for us and broadcasts a notification once an app has
    // been updated. This is the function that's triggered on the back of that
    // notification.  The function checks the app to make sure it matches the
    // expected version and then refreshes its <iframe> container so the new
    // version is visible.
    var app = this.apps.get(event.app.id)
    const version = event.version
    const updateTime = new Date(event.app.updated)
    const icons = ['😅', '😬', '🤢']

    // Duplicate notifications may trigger this function more than once
    if (this.activePolls.get(app.id)) {
      console.debug(`☝️ Refresh already in progress for ${app.title}`)
      return
    }
    this.activePolls.set(app.id, true)

    // Although the backend has confirmed the app is updated, it may take a
    // few attempts before the client sees the new version
    console.log(`🚰 Refreshing ${app.title} (expecting version ${version})`)
    var count = 0
    while (this.activePolls.get(app.id)) {
      // Get currrent app config as JSON
      const resp = await this.fetchApp(app.url)

      // Check version returned by client matches backend
      if (resp.app && resp.app.version === version) {
        console.log(`🕹️ ${app.title} has updated to version ${version}`)
        app = { ...app, ...event.app, ...resp.app, updated: updateTime }
        this.apps.set(app.id, app)

        app.el.dataset.version = app.version
        app.el.dataset.title = app.title
        app.iframe.name = `${app.id}-${app.version}`
        app.iframe.src = `${app.url}?ts=${updateTime.getTime()}`

        // Make the iframe jiggle
        app.el.classList.add('has-new-version')
        setTimeout(() => app.el.classList.remove('has-new-version'), 3000)
        this.activePolls.delete(app.id)
        return
      }

      // Call it quits if we can't reconcile the app's version after 4 attempts
      count++
      if (count >= 4) {
        this.activePolls.delete(app.id)
        console.error(
          `🥵 Failed to get latest version for ${app.title} (currently ${resp.app.version}, expected ${version})`
        )
        return
      }
      await utils.sleep(10000)
      console.debug(`${icons[count - 1]} Still refreshing ${app.title}...`)
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
