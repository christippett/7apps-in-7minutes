import utils from '../utils.js'

export class ApplicationService {
  constructor ({ apps, notificationService }) {
    this.activePolls = new Map()
    this.apps = new Map()
    apps.map(app => {
      const el = document.getElementById(app.name)
      const iframe = el.getElementsByTagName('iframe')[0]
      const appRef = { ...app, el, iframe }
      iframe.addEventListener('load', event =>
        this.checkVersion({ iframe: event.target, app: appRef })
      )
      this.apps.set(app.name, appRef)
    })

    // The backend is responsible for polling each app to check if and when
    // they're updated to a new version. When a new version is detected, the
    // backend sends a message to every client so they can refresh and show the
    // new version
    notificationService.subscribe('refresh-app', message => {
      const { version, app, duration } = message.data
      this.refreshApp({ version, app, duration })
    })
  }

  checkVersion ({ iframe, app }) {
    const doc = iframe.contentDocument
    try {
      return doc.getElementById('version').dataset.version
    } catch {
      // app.el.setAttribute('data-error', true)
      console.log(
        `😬 Unable to find version within IFrame document for ${app.title}`
      )
    }
  }

  async refreshApp (event) {
    // Rather than having every client poll each app separately, the backend
    // takes care of this for us and broadcasts a notification once an app has
    // been updated. This is the function that's triggered on the back of that
    // notification.  The function checks the app to make sure it matches the
    // expected version and then refreshes its <iframe> container so the new
    // version is visible.
    var app = this.apps.get(event.app.name)
    const version = event.version
    const updateTime = new Date(event.app.updated)
    const icons = ['😅', '😬', '🤢']

    // Duplicate notifications may trigger this function more than once
    if (this.activePolls.get(app.name)) {
      console.debug(`☝️ Refresh already in progress for ${app.title}`)
      return
    }
    this.activePolls.set(app.name, true)

    // Although the backend has confirmed the app is updated, it may take a
    // few attempts before the client sees the new version
    console.log(`🚰 Refreshing ${app.title} (expecting version ${version})`)
    var count = 0
    while (this.activePolls.get(app.name)) {
      // Get currrent app config as JSON
      const resp = await this.fetchApp(app.url)

      // Check version returned by client matches backend
      if (resp.app && resp.app.version === version) {
        console.log(`🕹️ ${app.title} has updated to version ${version}`)
        app = { ...app, ...event.app, ...resp.app, updated: updateTime }
        this.apps.set(app.name, app)

        app.el.dataset.version = app.version
        app.el.dataset.title = app.title
        app.iframe.name = `${app.name}-${app.version}`
        app.iframe.src = `${app.url}?ts=${updateTime.getTime()}`

        // Make the iframe jiggle
        app.el.classList.add('has-new-version')
        setTimeout(() => app.el.classList.remove('has-new-version'), 3000)
        this.activePolls.delete(app.name)
        return
      }

      // Call it quits if we can't reconcile the app's version after 4 attempts
      count++
      if (count >= 4) {
        this.activePolls.delete(app.name)
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
