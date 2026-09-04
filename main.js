const {
    app,
    BaseWindow,
    WebContentsView,
    ipcMain
} = require("electron");

const path = require("path");

let win = null;
let uiView = null;

const tabs = [];
let activeTab = null;
let nextTabId = 1;

const CHROME_HEIGHT = 100;

const HOME_PAGE =
    "file://" + path.join(__dirname, "index.html");


// ========================================
// CREATE WINDOW
// ========================================

function createWindow() {

    win = new BaseWindow({
        width: 1400,
        height: 900,
        minWidth: 900,
        minHeight: 600
    });

    // Browser toolbar
    uiView = new WebContentsView({
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    win.contentView.addChildView(uiView);

    uiView.webContents.loadFile(
        path.join(__dirname, "chrome.html")
    );

    updateBounds();

    createTab();

    win.on("resize", () => {
        updateBounds();
    });

    win.on("closed", () => {

        for (const tab of tabs) {
            try {
                tab.view.webContents.close();
            } catch {}
        }

        tabs.length = 0;

        activeTab = null;
        uiView = null;
        win = null;
    });
}


// ========================================
// UPDATE BOUNDS
// ========================================

function updateBounds() {

    if (!win)
        return;

    const bounds = win.getBounds();

    if (uiView) {

        uiView.setBounds({
            x: 0,
            y: 0,
            width: bounds.width,
            height: CHROME_HEIGHT
        });

    }

    for (const tab of tabs) {

        tab.view.setBounds({
            x: 0,
            y: CHROME_HEIGHT,
            width: bounds.width,
            height: Math.max(
                1,
                bounds.height - CHROME_HEIGHT
            )
        });

    }
}


// ========================================
// CREATE TAB
// ========================================

function createTab(url = HOME_PAGE) {

    if (!win)
        return;

    const id = nextTabId++;

    const view = new WebContentsView({
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    const tab = {
        id: id,
        view: view,
        title: "FemmBrowser",
        url: url
    };

    tabs.push(tab);

    win.contentView.addChildView(view);

    updateBounds();


    // Page title
    view.webContents.on(
        "page-title-updated",
        (_event, title) => {

            tab.title =
                title ||
                "FemmBrowser";

            sendTabs();

        }
    );


    // Normal navigation
    view.webContents.on(
        "did-navigate",
        (_event, newUrl) => {

            tab.url = newUrl;

            if (tab.id === activeTab) {
                sendState(tab);
            }

        }
    );


    // In-page navigation
    view.webContents.on(
        "did-navigate-in-page",
        (_event, newUrl) => {

            tab.url = newUrl;

            if (tab.id === activeTab) {
                sendState(tab);
            }

        }
    );


    // Page finished loading
    view.webContents.on(
        "did-finish-load",
        () => {

            const currentUrl =
                view.webContents.getURL();

            if (currentUrl) {
                tab.url = currentUrl;
            }

            if (tab.id === activeTab) {
                sendState(tab);
            }

            sendTabs();

        }
    );


    // Load page
    view.webContents.loadURL(url);

    // Activate tab
    switchTab(id);
}


// ========================================
// SWITCH TAB
// ========================================

function switchTab(id) {

    if (!win)
        return;

    const tab = tabs.find(
        t => t.id === id
    );

    if (!tab)
        return;

    for (const otherTab of tabs) {

        try {
            win.contentView.removeChildView(
                otherTab.view
            );
        } catch {}

    }

    win.contentView.addChildView(
        tab.view
    );

    updateBounds();

    activeTab = id;

    sendTabs();
    sendState(tab);
}


// ========================================
// CLOSE TAB
// ========================================

function closeTab(id) {

    if (!win)
        return;

    const index =
        tabs.findIndex(
            t => t.id === id
        );

    if (index === -1)
        return;

    const tab = tabs[index];

    try {
        win.contentView.removeChildView(
            tab.view
        );
    } catch {}

    try {
        tab.view.webContents.close();
    } catch {}

    tabs.splice(index, 1);

    if (tabs.length === 0) {
        createTab();
        return;
    }

    if (activeTab === id) {

        const newIndex =
            Math.min(
                index,
                tabs.length - 1
            );

        switchTab(
            tabs[newIndex].id
        );

    } else {

        sendTabs();

    }
}


// ========================================
// NAVIGATE
// ========================================

function navigate(value) {

    const tab = tabs.find(
        t => t.id === activeTab
    );

    if (!tab)
        return;

    let input = String(value).trim();

    if (!input)
        return;


    // Full URL
    if (
        input.startsWith("http://") ||
        input.startsWith("https://") ||
        input.startsWith("file://")
    ) {

        tab.url = input;

        tab.view.webContents.loadURL(
            input
        );

        // Keep address bar as FemmBrowser
        sendState(tab);

        return;
    }


    // Website without https://
    if (
        input.includes(".") &&
        !input.includes(" ")
    ) {

        const website =
            "https://" + input;

        tab.url = website;

        tab.view.webContents.loadURL(
            website
        );

        // Keep address bar as FemmBrowser
        sendState(tab);

        return;
    }


    // Search DuckDuckGo
    const searchUrl =
        "https://duckduckgo.com/?q=" +
        encodeURIComponent(input);

    tab.url = searchUrl;

    tab.view.webContents.loadURL(
        searchUrl
    );

    // Keep address bar as FemmBrowser
    sendState(tab);
}


// ========================================
// SEND TABS
// ========================================

function sendTabs() {

    if (
        !uiView ||
        uiView.webContents.isDestroyed()
    ) {
        return;
    }

    const data =
        tabs.map(tab => ({

            id: tab.id,

            title:
                tab.title ||
                "FemmBrowser",

            url:
                tab.url ||
                "",

            active:
                tab.id === activeTab

        }));

    uiView.webContents.send(
        "tabs-state",
        data
    );
}


// ========================================
// SEND STATE
// ========================================

function sendState(tab) {

    if (
        !uiView ||
        uiView.webContents.isDestroyed() ||
        !tab
    ) {
        return;
    }

    // IMPORTANT:
    // Always send "FemmBrowser" to the
    // address bar instead of the real URL.
    uiView.webContents.send(
        "browser-state",
        {
            url: "FemmBrowser",
            title:
                tab.title ||
                "FemmBrowser"
        }
    );
}


// ========================================
// NEW TAB
// ========================================

ipcMain.on(
    "new-tab",
    () => {

        createTab();

    }
);


// ========================================
// SWITCH TAB
// ========================================

ipcMain.on(
    "switch-tab",
    (_event, id) => {

        switchTab(id);

    }
);


// ========================================
// CLOSE TAB
// ========================================

ipcMain.on(
    "close-tab",
    (_event, id) => {

        closeTab(id);

    }
);


// ========================================
// NAVIGATE
// ========================================

ipcMain.on(
    "navigate",
    (_event, value) => {

        navigate(value);

    }
);


// ========================================
// BACK
// ========================================

ipcMain.on(
    "back",
    () => {

        const tab =
            tabs.find(
                t => t.id === activeTab
            );

        if (!tab)
            return;

        const history =
            tab.view.webContents
                .navigationHistory;

        if (
            history &&
            history.canGoBack()
        ) {

            history.goBack();

        }

    }
);


// ========================================
// FORWARD
// ========================================

ipcMain.on(
    "forward",
    () => {

        const tab =
            tabs.find(
                t => t.id === activeTab
            );

        if (!tab)
            return;

        const history =
            tab.view.webContents
                .navigationHistory;

        if (
            history &&
            history.canGoForward()
        ) {

            history.goForward();

        }

    }
);


// ========================================
// RELOAD
// ========================================

ipcMain.on(
    "reload",
    () => {

        const tab =
            tabs.find(
                t => t.id === activeTab
            );

        if (!tab)
            return;

        tab.view.webContents.reload();

    }
);


// ========================================
// HOME
// ========================================

ipcMain.on(
    "home",
    () => {

        const tab =
            tabs.find(
                t => t.id === activeTab
            );

        if (!tab)
            return;

        tab.url = HOME_PAGE;
        tab.title = "FemmBrowser";

        tab.view.webContents.loadFile(
            path.join(
                __dirname,
                "index.html"
            )
        );

        sendState(tab);
        sendTabs();

    }
);


// ========================================
// FULLSCREEN
// ========================================

ipcMain.on(
    "fullscreen",
    () => {

        if (!win)
            return;

        win.setFullScreen(
            !win.isFullScreen()
        );

    }
);


// ========================================
// APP READY
// ========================================

app.whenReady().then(
    () => {

        createWindow();

        app.on(
            "activate",
            () => {

                if (
                    BaseWindow.getAllWindows()
                        .length === 0
                ) {

                    createWindow();

                }

            }
        );

    }
);


// ========================================
// CLOSE APP
// ========================================

app.on(
    "window-all-closed",
    () => {

        if (
            process.platform !== "darwin"
        ) {

            app.quit();

        }

    }
);