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
      el.innerHTML = data.text;
      return el;
    };

    const connect = (logContainerElement) => {
      const websocket = new WebSocket(webSocketUri);
      websocket.onopen = () => console.log("✏️ Log stream connected");
      websocket.onerror = (e) => console.log(`💥 Error with log stream: ${e}`);
      websocket.onclose = () => {
        console.log("🔌 Log stream disconnected");
        // Attempt to re-connect
        setTimeout(() => connect(), 1000);
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

    const checkStatus = async (iframeElement) => {
      const overlayElement = document.getElementById(`app-${iframeElement.dataset.id}`);
      const parentElement = iframeElement.parentElement;
      const appUrl = iframeElement.dataset.url;
      const appName = iframeElement.dataset.name;
      const appTitle = iframeElement.dataset.title;

      // Get latest commit hash from app
      try {
        var response = await fetch(appUrl, {
          cache: "no-cache",
          headers: { "Accept-Language": "application/json" },
        });
      } catch (e) {
        // Display error message in lieu of an iframe
        overlayElement.classList.remove("is-hidden");
        overlayElement.getElementsByClassName("title")[0].innerText = e.message;
        return;
      }
      if (response == undefined || !response.ok) {
        // Although there's no error, something's still not right
        overlayElement.classList.remove("is-hidden");
        overlayElement.getElementsByClassName("title")[0].innerText = response.status;
        return;
      } else {
        // Remove overlay and reveal iframe
        overlayElement.classList.add("is-hidden");
      }

      var app = appMap.get(appName);
      const data = await response.json();
      const newVersion = data.commit_sha.trim();
      const timestamp = Date.now();

      if (app === undefined) {
        appMap.set(appName, {
          version: newVersion,
          previousVersion: null,
          lastUpdated: timestamp,
        });
      } else if (newVersion !== app.version && newVersion !== app.previousVersion) {
        console.log(`💾 New version found for ${appTitle}: ${newVersion}`);
        appMap.set(appName, {
          version: newVersion,
          previousVersion: app.version,
          lastUpdated: timestamp,
        });

        // Add query string to avoid potential caching issues
        iframeElement.name = `${iframeElement.name.split("-")[0]}-${timestamp}`;
        iframeElement.src = `${appUrl}?ts=${timestamp}`; // forces refresh

        // Draw attention to the app if a new version is detected
        parentElement.classList.add("has-new-version");
        setTimeout(() => parentElement.classList.remove("has-new-version"), 3000);
      }
    };

    // Start polling loop
    const monitorStatus = async () => {
      if (monitoringEnabled) {
        var iframes = document.getElementsByTagName("iframe");
        for (var i = 0, max = iframes.length; i < max; i++) {
          checkStatus(iframes[i]);
        }
      }
      setTimeout(monitorStatus, 2000);
    };

    const pauseMonitoring = () => (monitoringEnabled = false);
    const resumingMonitoring = () => (monitoringEnabled = true);

    var monitoringEnabled = true;

    return {
      monitorStatus,
      pauseMonitoring,
      resumingMonitoring,
      apps: appMap,
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
