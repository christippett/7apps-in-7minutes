export class NotificationService {
  constructor () {
    this.subscriptions = new Map()
    const scheme = window.location.protocol === 'https:' ? 'wss://' : 'ws://'
    const webSocketUri =
      scheme +
      window.location.hostname +
      (window.location.port ? ':' + window.location.port : '') +
      '/ws'
    this.connect(webSocketUri)
  }

  connect (uri) {
    const websocket = new window.WebSocket(uri)
    websocket.onopen = () => {
      console.log('🔌 Websocket connected')
    }
    websocket.onerror = () => console.error('💥 Error connecting to websocket')
    websocket.onclose = () => {
      console.log('🔌 Websocket disconnected')
      setTimeout(() => this.connect(uri), 20000)
    }
    websocket.onmessage = event => {
      const message = JSON.parse(event.data)
      this.dispatch(message.topic, message)
    }
    this.websocket = websocket
    return websocket
  }

  subscribe (topic, callback) {
    const id = +new Date() + Math.floor(Math.random() * 1000)
    this.subscriptions.set(id, { topic, callback })
    console.log(`🗞️ Subscribed to topic '${topic}' (#${id})`)
    return id
  }

  unsubscribe (id) {
    const sub = this.subscriptions.get(id)
    if (sub) {
      this.subscriptions.delete(id)
      console.log(`🗞️ Unsubscribed from topic '${sub.topic}' (#${id})`)
    }
  }

  dispatch (topic, message) {
    const subscriptions = Array.from(this.subscriptions.values()).filter(
      sub => sub.topic === topic
    )
    subscriptions.forEach(sub => sub.callback(message))
  }
}
