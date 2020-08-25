/* eslint-disable no-unused-expressions */

import { ApplicationService } from './services/app.js'
import { CommentService } from './services/comment.js'
import { LogService } from './services/log.js'
import { NotificationService } from './services/notification.js'
import { Timeline } from './timeline.js'
import utils from './utils.js'

const props = window.props
const notificationService = new NotificationService()
const timeline = new Timeline({
  el: document.getElementById('timeline')
})
const comment = new CommentService({
  el: document.getElementById('commentary')
})
const logger = new LogService({
  el: document.getElementById('logs'),
  notificationService
})
const app = new ApplicationService({
  apps: props.apps,
  themes: props.themes,
  timeline,
  notificationService
})

// Debug WebSocket
window.ns = notificationService
notificationService.subscribe('echo', message =>
  comment.add({ text: message.data.text })
)

notificationService.subscribe('app-updated', message => {
  const { app, duration } = message.data
  const { minute, second } = utils.timePart(duration * 1000)
  const time = [
    minute ? `${minute} minutes` : '',
    second ? `${second} seconds` : ''
  ]
  comment.add({
    text: `<p><span class='is-fancy'>${
      app.title
    }</span> updated in <strong><em>${time.join(', ')}</em></strong></p>`,
    style: 'success'
  })
})
;(() => {
  window.demo = function () {
    const data = {
      ...props,
      isFullscreen: false,
      isLoading: false,
      isDeploying: false,
      showPreview: false,
      showLogs: false,
      themeIndex: 0
    }

    const methods = {
      init () {
        const demoElement = document.getElementById('demo')
        const buildElement = document.getElementById('build')
        const logElement = document.getElementById('logs')

        // Toggle fullscreen
        const demoContainer = demoElement.getElementsByClassName('box')[0]
        demoContainer.addEventListener('click', event => {
          event.stopPropagation()
          demoElement.classList.toggle('is-fullscreen')
        })

        // Wire-up deploy button
        const deployButton = demoElement.getElementsByClassName(
          'deploy button'
        )[0]
        deployButton.addEventListener('click', event => {
          event.stopPropagation()
          deployButton.classList.add('is-loading')
          demoElement.classList.add('is-loading')
          this.deployTheme().then(() => {
            demoElement.classList.remove('is-loading')
            deployButton.classList.remove('is-loading')
            demoElement.classList.add('is-active')
            logElement.classList.remove('is-hidden')
            buildElement.style = 'opacity: 0;'
            setTimeout(() => buildElement.classList.add('is-hidden'), 2500)
          })
        })
      },
      previousTheme () {
        this.themeIndex =
          this.themeIndex === 0 ? this.themes.length - 1 : this.themeIndex - 1
      },
      nextTheme () {
        this.themeIndex =
          this.themeIndex + 1 === this.themes.length ? 0 : this.themeIndex + 1
      },
      theme () {
        return this.themes[this.themeIndex]
      },
      themeGradient () {
        const theme = this.theme()
        const colors = theme.colors
        return [
          `background: ${colors[0]};`,
          `background: linear-gradient(45deg,${colors.join(
            ','
          )}) 0% 0% / 400% 400%;`
        ].join(' ')
      },
      async deployTheme () {
        try {
          var { build, status } = await app.deploy({
            data: this.theme()
          })
        } catch (e) {
          comment.add({ text: e })
          return false
        }

        logger.getLogs(build.id)
        timeline.startCountdown(build.createTime)
        this.build = build

        setTimeout(() => {
          this.themeIndex = Math.floor(
            Math.random() * Math.floor(this.themes.length)
          )
        }, 10000)

        const logComment = {
          text: [
            '<p>The stream of text you see in the box above are the logs output by Cloud Build.</p>',
            '<p>You can check out the steps used to deploy each app, along with the source code for everything on ',
            "<a href='https://github.com/servian/7apps-google-cloud/blob/demo/app/cloudbuild.yaml'><strong>GitHub</strong></a>.</p>"
          ].join(''),
          style: 'info'
        }

        if (status === 409) {
          const message = [
            '<p>It seems a another deployment is already in-progress. Give it a minute or two <em>(or seven)</em> and try again.</p>',
            "<p>In the meantime, let's check out what's happening with the current deployment.</p>"
          ].join('')
          comment.queue({
            messages: [message, logComment],
            style: 'warning'
          })
        } else {
          const message = [
            '<span class="is-fancy">Woohoo!</span> You just triggered a new <strong>Cloud Build</strong> job! ',
            `Keep an eye out for the version <span class="is-family-monospace">${build.version}</span>, that's yours!`
          ].join('')
          comment.queue({ messages: [message, logComment], style: 'success' })
        }
      }
    }

    return {
      ...data,
      ...methods
    }
  }

  import(
    'https://cdn.jsdelivr.net/gh/alpinejs/alpine@v2.x.x/dist/alpine.min.js'
  )
})()
