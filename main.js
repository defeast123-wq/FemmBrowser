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

    // Create first tab
    createTab();

    // Resize everything when window changes size
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
// UPDATE WINDOW / TAB SIZES
// ========================================

function updateBounds() {

    if (!win)
        return;

    const bounds = win.getBounds();

    // Toolbar
    if (uiView) {

        uiView.setBounds({
            x: 0,
            y: 0,
            width: bounds.width,
            height: CHROME_HEIGHT
        });

    }

    // Browser pages
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
        title: "New Tab",
        url: url
    };

    tabs.push(tab);

    win.contentView.addChildView(view);

    updateBounds();

    // Page title changed
    view.webContents.on(
        "page-title-updated",
        (_event, title) => {

            tab.title =
                title ||
                "New Tab";

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

    // Make this tab active
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

    // Remove browser pages
    for (const otherTab of tabs) {

        try {
            win.contentView.removeChildView(
                otherTab.view
            );
        } catch {}

    }

    // Put selected page back
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

    // If all tabs were closed,
    // create a new one
    if (tabs.length === 0) {

        createTab();

        return;
    }

    // If we closed the active tab,
    // switch to another tab
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
// NAVIGATION
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


    // ------------------------------------
    // Full URL
    // ------------------------------------

    if (
        input.startsWith("http://") ||
        input.startsWith("https://") ||
        input.startsWith("file://")
    ) {

        tab.url = input;

        tab.view.webContents.loadURL(
            input
        );

        sendState(tab);

        return;
    }


    // ------------------------------------
    // Website without https://
    // ------------------------------------

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

        sendState(tab);

        return;
    }


    // ------------------------------------
    // DuckDuckGo search
    // ------------------------------------

    const searchUrl =
        "https://duckduckgo.com/?q=" +
        encodeURIComponent(input);

    tab.url = searchUrl;

    tab.view.webContents.loadURL(
        searchUrl
    );

    sendState(tab);
}


// ========================================
// SEND TAB DATA TO CHROME.HTML
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
                "New Tab",

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
// SEND CURRENT PAGE DATA
// ========================================

function sendState(tab) {

    if (
        !uiView ||
        uiView.webContents.isDestroyed() ||
        !tab
    ) {
        return;
    }

    let currentUrl = "";

    try {
        currentUrl =
            tab.view.webContents.getURL();
    } catch {}

    uiView.webContents.send(
        "browser-state",
        {

            url:
                currentUrl ||
                tab.url ||
                "",

            title:
                tab.title ||
                "New Tab"

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
// CLOSE ALL WINDOWS
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