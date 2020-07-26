(function () {
  /* LOG STREAM CLIENT ------------------------------------------------------ */

  window.LogStreamClient = (function () {
    const scheme = window.location.protocol == "https:" ? "wss://" : "ws://";
    const webSocketUri =
      scheme +
      window.location.hostname +
      (location.port ? ":" + location.port : "") +
      "/ws";

    const createLogElement = (data) => {
      let el = document.createElement("p");

      el.setAttribute("data-step", data.step || "");
      el.setAttribute("data-id", data.id || "");
      el.setAttribute("data-status", (data.status || "").toLowerCase());

      let message = data.status || data.message || data.text;
      let html = [
        `<span class="lg-step">${(data.step || "").padEnd(2)}</span> `,
        `<span class="lg-id">${data.id || ""}</span>`,
        `<span class="lg-text">${message}</span>`,
      ];
      el.innerHTML = html.join(" ");
      return el;
    };

    const connect = (logContainerElement) => {
      const websocket = new WebSocket(webSocketUri);
      websocket.onopen = () => console.log("✏️ Log stream connected");
      websocket.onerror = (e) => console.log(`💥 Error with log stream: ${e}`);
      websocket.onclose = () => {
        console.log("🔌 Log stream disconnected");
        // Attempt to re-connect
        setTimeout(() => connect(logContainerElement), 10000);
      };
      websocket.onmessage = (event) => {
        if (logContainerElement === null) return;
        let data = JSON.parse(event.data);
        let logElement = createLogElement(data);
        logContainerElement.appendChild(logElement);
        logContainerElement.scrollTop = logContainerElement.scrollHeight;
      };
    };

    var logContainerElement = null;

    return {
      connect: (el) => {
        logContainerElement = el;
        connect(logContainerElement);
      },
    };
  })();

  /* APPLICATION STATUS ----------------------------------------------------- */

  window.App = (() => {
    const appMap = new Map();
    const versionMap = new Map();

    const checkStatus = async (iframeElement) => {
      const timestamp = new Date();
      const appName = iframeElement.dataset.name;
      const appUrl = iframeElement.dataset.url;
      const appTitle = iframeElement.dataset.title;
      const app = appMap.get(appName);
      const overlayElement = document.getElementById(`${appName}-overlay`);
      const appElement = document.getElementById(appName);

      var errorMessage = null;
      try {
        // Get current app version (git commit hash)
        var response = await fetch(appUrl, {
          cache: "no-cache",
          headers: { Accept: "application/json" },
        });
        var data = await response.json();
        var newVersion = data.version;
      } catch (e) {
        errorMessage = e.message;
      }

      if (response === undefined || !response.ok || newVersion === undefined) {
        iframeElement.setAttribute("data-error", true);
        overlayElement.classList.remove("is-hidden");
        overlayElement.getElementsByClassName("title")[0].innerHTML =
          errorMessage || "Unavailable";
        return;
      } else if (
        iframeElement.hasAttribute("data-error") ||
        appElement.classList.contains("is-hidden")
      ) {
        // Reveal app if it was previously mased by an error
        iframeElement.removeAttribute("data-error");
        iframeElement.src = `${appUrl}?ts=${timestamp}`; // refresh iframe
        overlayElement.classList.add("is-hidden");
        appElement.classList.remove("is-hidden");
      }

      if (app === undefined) {
        appMap.set(appName, {
          version: newVersion,
          previousVersion: null,
          lastUpdated: timestamp,
        });
      } else if (newVersion !== app.version && newVersion !== app.previousVersion) {
        console.log(`💾 New version detected for ${appTitle} (${newVersion})`);
        appMap.set(appName, {
          version: newVersion,
          previousVersion: app.version,
          lastUpdated: timestamp,
        });

        // Record new version for leaderboard
        var versionStats = versionMap.get(newVersion);
        if (versionStats === undefined) {
          versionStats = new Array();
          versionMap.set(newVersion, versionStats);
        }
        versionStats.push({ app: app.name, title: app.title, updated: timestamp });

        // Add query string to avoid any caching issues
        iframeElement.name = `${iframeElement.name.split("-")[0]}-${timestamp}`;
        iframeElement.src = `${appUrl}?ts=${timestamp}`; // forces refresh

        // Draw attention to the app when a new version is detected
        appElement.classList.add("has-new-version");
        setTimeout(() => appElement.classList.remove("has-new-version"), 3000);
      }
    };

    // Start polling loop
    const monitorStatus = async ({ interval }) => {
      if (monitoringEnabled) {
        var iframes = document.getElementsByTagName("iframe");
        for (var i = 0, max = iframes.length; i < max; i++) {
          checkStatus(iframes[i]);
        }
      }
      setTimeout(() => monitorStatus({ interval }), interval);
    };

    const stopMonitor = () => (monitoringEnabled = false);
    const startMonitor = (payload) => {
      monitoringEnabled = true;
      monitorStatus(payload);
    };

    var monitoringEnabled = true;

    return {
      startMonitor,
      stopMonitor,
      apps: appMap,
      versionStats: versionMap,
    };
  })();

  /* DEPLOYMENT CLIENT ------------------------------------------------------ */

  window.DeploymentClient = (function () {
    const triggerDeployment = async ({ gradientName, asciiFont, titleFont }) => {
      let payload = {
        style: {
          gradient_name: gradientName,
          ascii_font: asciiFont,
          title_font: titleFont,
        },
      };
      let resp = await fetch("/deploy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      return { status: resp.status, data: resp.json() };
    };

    return {
      triggerDeployment,
    };
  })();
})();
