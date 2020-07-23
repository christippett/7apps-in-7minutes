(function () {
  async function triggerCloudBuild() {
    let resp = fetch("/", {
      method: "POST",
    });
    return resp;
  }

  function createLogElement(data) {
    var el = document.createElement("p");
    el.innerHTML = data.text;
    return el;
  }

  const logStream = (function () {
    const scheme = window.location.protocol == "https:" ? "wss://" : "ws://";
    const webSocketUri =
      scheme +
      window.location.hostname +
      (location.port ? ":" + location.port : "") +
      "/ws";

    const connect = () => {
      const websocket = new WebSocket(webSocketUri);
      websocket.onopen = () => console.log("✏️ Connected to log stream");
      websocket.onerror = () => console.log("💥 Error with log stream");
      websocket.onclose = () => {
        console.log("🔌 Disconnected from log stream");
        // Attempt to re-connect
        setTimeout(() => connect(), 1000);
      };
      websocket.onmessage = (event) => {
        if (logParentElement === null) return;
        var data = JSON.parse(event.data);
        var logElement = createLogElement(data);
        logParentElement.appendChild(logElement);
        logParentElement.scrollTop = logParentElement.scrollHeight;
      };
    };

    let logParentElement = null;

    return {
      connect,
      setParentElement: (el) => {
        logParentElement = el;
      },
      getParentElement: () => logParentElement,
    };
  })();

  window.logStream = logStream;
  window.triggerCloudBuild = triggerCloudBuild;
})();
