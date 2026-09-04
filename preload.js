const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("femm", {

    newTab: () =>
        ipcRenderer.send("new-tab"),

    switchTab: (id) =>
        ipcRenderer.send("switch-tab", id),

    closeTab: (id) =>
        ipcRenderer.send("close-tab", id),

    navigate: (url) =>
        ipcRenderer.send("navigate", url),

    back: () =>
        ipcRenderer.send("back"),

    forward: () =>
        ipcRenderer.send("forward"),

    reload: () =>
        ipcRenderer.send("reload"),

    home: () =>
        ipcRenderer.send("home"),

    fullscreen: () =>
        ipcRenderer.send("fullscreen"),

    onState: (callback) => {

        ipcRenderer.on(
            "browser-state",
            (_event, data) =>
                callback(data)
        );

    },

    onTabs: (callback) => {

        ipcRenderer.on(
            "tabs-state",
            (_event, data) =>
                callback(data)
        );

    }

});