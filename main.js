const {
    app,
    BaseWindow,
    WebContentsView,
    ipcMain
} = require("electron");

const path = require("path");

let win;
let uiView;

const tabs = [];
let activeTab = null;
let nextTabId = 1;

const HOME_PAGE =
    "file://" + path.join(__dirname, "index.html");

function createWindow() {

    win = new BaseWindow({
        width: 1400,
        height: 900,
        minWidth: 900,
        minHeight: 600
    });

    // Browser UI
    uiView = new WebContentsView({
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    win.contentView.addChildView(uiView);

    uiView.setBounds({
        x: 0,
        y: 0,
        width: 1400,
        height: 100
    });

    uiView.webContents.loadFile(
        path.join(__dirname, "chrome.html")
    );

    createTab();

    win.on("resize", updateBounds);

    win.on("closed", () => {
        win = null;
    });
}

function updateBounds() {

    if (!win)
        return;

    const bounds = win.getBounds();

    uiView.setBounds({
        x: 0,
        y: 0,
        width: bounds.width,
        height: 100
    });

    tabs.forEach(tab => {

        tab.view.setBounds({
            x: 0,
            y: 100,
            width: bounds.width,
            height: bounds.height - 100
        });

    });
}

function createTab(url = HOME_PAGE) {

    const id = nextTabId++;

    const view = new WebContentsView({
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    win.contentView.addChildView(view);

    tabs.push({
        id,
        view,
        title: "New Tab",
        url
    });

    view.setBounds({
        x: 0,
        y: 100,
        width: win.getBounds().width,
        height: win.getBounds().height - 100
    });

    view.webContents.loadURL(url);

    view.webContents.on(
        "page-title-updated",
        (_event, title) => {

            const tab = tabs.find(t => t.id === id);

            if (tab) {
                tab.title = title;
                sendTabs();
            }

        }
    );

    view.webContents.on(
        "did-navigate",
        (_event, url) => {

            const tab = tabs.find(t => t.id === id);

            if (tab) {
                tab.url = url;

                if (tab.id === activeTab) {
                    sendState(tab);
                }
            }

        }
    );

    view.webContents.on(
        "did-navigate-in-page",
        (_event, url) => {

            const tab = tabs.find(t => t.id === id);

            if (tab) {
                tab.url = url;

                if (tab.id === activeTab) {
                    sendState(tab);
                }
            }

        }
    );

    switchTab(id);
}

function switchTab(id) {

    const tab = tabs.find(t => t.id === id);

    if (!tab)
        return;

    tabs.forEach(t => {

        try {
            win.contentView.removeChildView(t.view);
        } catch {}

    });

    win.contentView.addChildView(tab.view);

    const bounds = win.getBounds();

    tab.view.setBounds({
        x: 0,
        y: 100,
        width: bounds.width,
        height: bounds.height - 100
    });

    activeTab = id;

    sendTabs();
    sendState(tab);
}

function closeTab(id) {

    const index = tabs.findIndex(t => t.id === id);

    if (index === -1)
        return;

    const tab = tabs[index];

    try {
        win.contentView.removeChildView(tab.view);
        tab.view.webContents.close();
    } catch {}

    tabs.splice(index, 1);

    if (tabs.length === 0) {
        createTab();
        return;
    }

    if (activeTab === id) {

        const newTab =
            tabs[Math.max(0, index - 1)];

        switchTab(newTab.id);

    } else {
        sendTabs();
    }
}

function navigate(value) {

    const tab = tabs.find(t => t.id === activeTab);

    if (!tab)
        return;

    let url = value.trim();

    if (!url)
        return;

    if (
        !url.startsWith("http://") &&
        !url.startsWith("https://") &&
        !url.startsWith("file://")
    ) {

        if (
            url.includes(".") &&
            !url.includes(" ")
        ) {

            url = "https://" + url;

        } else {

            url =
                "https://duckduckgo.com/?q=" +
                encodeURIComponent(url);

        }

    }

    tab.url = url;

    tab.view.webContents.loadURL(url);

    sendState(tab);
}

function sendTabs() {

    const data = tabs.map(tab => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        active: tab.id === activeTab
    }));

    uiView.webContents.send(
        "tabs-state",
        data
    );
}

function sendState(tab) {

    if (!tab)
        return;

    uiView.webContents.send(
        "browser-state",
        {
            url: tab.url,
            title: tab.title
        }
    );
}


// =========================
// IPC
// =========================

ipcMain.on("new-tab", () => {
    createTab();
});

ipcMain.on("switch-tab", (_event, id) => {
    switchTab(id);
});

ipcMain.on("close-tab", (_event, id) => {
    closeTab(id);
});

ipcMain.on("navigate", (_event, value) => {
    navigate(value);
});


// BACK
ipcMain.on("back", () => {

    const tab = tabs.find(t => t.id === activeTab);

    if (
        tab &&
        tab.view.webContents.navigationHistory.canGoBack()
    ) {

        tab.view.webContents.navigationHistory.goBack();

    }

});


// FORWARD
ipcMain.on("forward", () => {

    const tab = tabs.find(t => t.id === activeTab);

    if (
        tab &&
        tab.view.webContents.navigationHistory.canGoForward()
    ) {

        tab.view.webContents.navigationHistory.goForward();

    }

});


ipcMain.on("reload", () => {

    const tab = tabs.find(t => t.id === activeTab);

    if (tab) {
        tab.view.webContents.reload();
    }

});


ipcMain.on("home", () => {

    const tab = tabs.find(t => t.id === activeTab);

    if (!tab)
        return;

    tab.url = HOME_PAGE;

    tab.view.webContents.loadFile(
        path.join(__dirname, "index.html")
    );

    sendState(tab);
});


ipcMain.on("fullscreen", () => {

    if (win) {

        win.setFullScreen(
            !win.isFullScreen()
        );

    }

});


// =========================
// APP
// =========================

app.whenReady().then(() => {

    createWindow();

    app.on("activate", () => {

        if (BaseWindow.getAllWindows().length === 0) {
            createWindow();
        }

    });

});


app.on("window-all-closed", () => {

    if (process.platform !== "darwin") {
        app.quit();
    }

});