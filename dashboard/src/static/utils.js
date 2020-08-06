(function () {
  "use strict";
  const utils = (() => {
    return {
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    };
  })();

  /* LOG STREAM CLIENT ------------------------------------------------------ */

  class NotificationService {
    constructor() {
      const scheme = window.location.protocol == "https:" ? "wss://" : "ws://";
      const webSocketUri =
        scheme +
        window.location.hostname +
        (location.port ? ":" + location.port : "") +
        "/ws";
      this.websocket = this.connect(webSocketUri);
      this.subscriptions = new Map();
    }

    connect(uri) {
      const websocket = new WebSocket(uri);
      websocket.onopen = () => console.log("🔌 Websocket connected");
      websocket.onerror = () => console.error("💥 Error connecting to websocket");
      websocket.onclose = () => {
        console.log("🔌 Websocket disconnected");
        setTimeout(() => this.connect(uri), 20000);
      };
      websocket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        const subscriptions = this.getTopicSubscriptions(message.topic);
        subscriptions.forEach((callback) => callback(message));
      };
      return websocket;
    }

    addSubscription(topic, callback) {
      var subscriptions = this.getTopicSubscriptions(topic);
      subscriptions.push(callback);
      this.subscriptions.set(topic, subscriptions);
    }

    getTopicSubscriptions(topic) {
      return this.subscriptions.get(topic) || [];
    }
  }

  /* APPLICATION STATUS ----------------------------------------------------- */

  class AppService {
    constructor() {
      this.apps = new Map();
      this.subscriptions = new Array();
      this.latestVersion = null;
      this.lastUpdated = new Date(1990, 1, 1);
      this._stylesheets = new Map();
      this._activePolls = new Map();
    }

    addSubscription(callback) {
      this.subscriptions.push(callback);
    }

    async replaceStylesheet(app) {
      var stylesheet = this._stylesheets.get(app.name);
      if (!stylesheet) {
        stylesheet = document.createElement("link");
        stylesheet.dataset.app = app.name;
        document.head.appendChild(stylesheet);
      }
      stylesheet.href = `https://fonts.googleapis.com/css2?family=${app.theme.font}&display=swap`;
      stylesheet.rel = "stylesheet";
      await utils.sleep(2000);
    }

    async fetchApp(url) {
      var returnVal = { error: null, app: undefined };
      try {
        var resp = await fetch(url, {
          cache: "no-cache",
          headers: { Accept: "application/json" },
        });
        var appData = await resp.json();
        if (!resp.ok) throw `${resp.status} ${resp.statusText}`;
      } catch (e) {
        returnVal.error = e.message;
        return returnVal;
      }
      returnVal.app = appData;
      return returnVal;
    }

    async refreshApp({ app, duration }) {
      let updated = new Date(app.updated);
      if (updated > this.lastUpdated) {
        this.latestVersion = app.version;
        this.lastUpdated = updated;
      }
      if (this._activePolls.get(app.name)) {
        console.debug(`☝️ Refresh in progress for ${app.name}`);
        return;
      }
      this._activePolls.set(app.name, true);

      console.log(`🚰 Refreshing ${app.title} (expecting version ${this.latestVersion})`);
      const el = document.getElementById(app.name);
      const iframe = el.getElementsByTagName("iframe")[0];
      const currentVersion = el.dataset.version;
      const overlay = el.getElementsByClassName("is-overlay")[0];
      const icons = ["😅", "🤔", "🤨", "😬", "🤢"];

      var count = 0;
      while (this._activePolls.get(app.name)) {
        let resp = await this.fetchApp(iframe.src);
        if (resp.error) {
          iframe.setAttribute("data-error", true);
          overlay.classList.remove("is-hidden");
          overlay.getElementsByClassName("title")[0].innerHTML = resp.error;
        } else if (iframe.dataset.error) {
          iframe.removeAttribute("data-error");
          overlay.classList.add("is-hidden");
          overlay.getElementsByClassName("title")[0].innerHTML = app.title;
        }
        if (resp.app && resp.app.version === this.latestVersion) {
          this._activePolls.delete(app.name);
          app = { ...app, ...resp.app };
          this.apps.set(app.name, app);
          el.dataset.version = app.version;
          el.dataset.title = app.title;
          iframe.name = `${iframe.name.split("-")[0]}-${updated}`;
          iframe.src = `${app.url}?ts=${updated}`;
          // Load custom application font
          await this.replaceStylesheet(app);
          // Notify subscribers of app update
          this.subscriptions.forEach((callback) => callback({ app, duration }));
          // Animate iframe to alert user of new version
          el.classList.add("has-new-version");
          setTimeout(() => el.classList.remove("has-new-version"), 3000);
          return;
        }
        count++;
        if (count >= 6) {
          this._activePolls.delete(app.name);
          console.error(
            `🥵 Failed to get latest version for ${app.title} (expecting ${this.latestVersion}, got ${app.version})`
          );
          return;
        }
        await utils.sleep(10000);
        console.debug(`${icons[count - 1]} Still refreshing ${app.title}...`);
      }
    }

    async deployUpdate({ gradient, asciiFont, font }) {
      let payload = { gradient, font, ascii_font: asciiFont };
      return await fetch("/deploy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    }
  }

  class LogHandler {
    constructor(container) {
      this.container = container;
    }

    createLogRecord(data) {
      let el = document.createElement("p");
      el.setAttribute("data-id", data.id || "");
      el.setAttribute("data-step", data.step || "");
      if (data.type) el.setAttribute("data-type", data.type.toLowerCase());

      if (data.step && data.id) {
        // e.g. Step #10 - gae-standard --->
        let step = document.createElement("span");
        step.setAttribute("class", "lg-step");
        step.innerText = `Step #${data.step}`.padEnd(8);
        el.appendChild(step);

        let id = document.createElement("span");
        id.setAttribute("class", "lg-id");
        id.innerText = data.id;
        el.appendChild(id);
      }

      let message = document.createElement("span");
      message.setAttribute("class", "lg-text");
      message.innerText = data.text;
      el.appendChild(message);

      this.container.appendChild(el);
      this.container.scrollTop = this.container.scrollHeight;
    }

    flushLogs() {
      this.container.innerHTML = "";
    }
  }

  const notificationService = new NotificationService();
  const appService = new AppService();
  const logHandler = new LogHandler(document.getElementById("logs"));
  notificationService.addSubscription("log", (message) =>
    logHandler.createLogRecord(message.data)
  );
  notificationService.addSubscription("refresh-app", (message) =>
    appService.refreshApp(message.data)
  );

  window._ = { notificationService, appService, logHandler };
})();
