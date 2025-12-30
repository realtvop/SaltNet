const DB_API_URL = window.SALTNET_DB_URL || "https://saltnet_db_test.realtvop.top";
const STORAGE_KEY = "saltnetAuthState";
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;
const DIFFICULTIES = ["basic", "advanced", "expert", "master", "remaster"];

let authState = loadAuthState();
let uploading = false;

const ui = {
    status: null,
    statusHint: null,
    authBtn: null,
    uploadBtn: null,
    dialog: null,
    accountDialog: null,
    identifierInput: null,
    passwordInput: null,
};

bootstrap();

function bootstrap() {
    const start = async () => {
        await ensureMDUI();
        injectStyles();
        createFloatingPanel();
        updateControls();
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
}

function loadAuthState() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch {
        return null;
    }
}

function saveAuthState(next) {
    authState = next;
    if (next) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } else {
        localStorage.removeItem(STORAGE_KEY);
    }
    updateControls();
}

function isSessionExpired() {
    if (!authState?.sessionExpiry) return true;
    return Date.now() >= authState.sessionExpiry;
}

function ensureMDUI() {
    if (window.mdui?.snackbar) return Promise.resolve();

    const head = document.head || document.getElementsByTagName("head")[0];

    if (!document.querySelector('link[href*="mdui@2/mdui.css"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/mdui@2/mdui.css";
        head.appendChild(link);
    }

    if (!document.querySelector('link[href*="MaterialIcons/regular.css"]')) {
        const iconLink = document.createElement("link");
        iconLink.rel = "stylesheet";
        iconLink.href = "//salt.realtvop.top/MaterialIcons/regular.css";
        head.appendChild(iconLink);
    }

    return new Promise(resolve => {
        if (window.mdui?.snackbar) {
            resolve();
            return;
        }

        const script = document.createElement("script");
        script.src = "https://unpkg.com/mdui@2/mdui.global.js";
        script.onload = async () => {
            await Promise.all([
                customElements.whenDefined("mdui-dialog"),
                customElements.whenDefined("mdui-text-field"),
                customElements.whenDefined("mdui-button-icon"),
            ]).catch(() => {});
            resolve();
        };
        script.onerror = () => resolve();
        head.appendChild(script);
    });
}

function injectStyles() {
    if (document.getElementById("saltnet-updater-style")) return;
    const style = document.createElement("style");
    style.id = "saltnet-updater-style";
    style.textContent = `
#saltnet-floating-panel {
    position: fixed;
    top: 50%;
    right: 16px;
    z-index: 2147483647;
    transform: translateY(-50%);
    width: 64px;
    max-width: calc(100vw - 32px);
    font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
#saltnet-floating-panel mdui-card {
    width: 64px;
    padding: 10px 8px;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.14);
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
}
#saltnet-floating-panel .header {
    display: none;
}
#saltnet-floating-panel .actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
#saltnet-floating-panel .status {
    display: none;
}
#saltnet-login-dialog,
#saltnet-login-dialog::backdrop {
    z-index: 2147483647 !important;
}
#saltnet-login-dialog mdui-text-field input,
#saltnet-login-dialog mdui-text-field textarea {
    pointer-events: auto;
}
@media (max-width: 600px) {
    #saltnet-floating-panel {
        top: auto;
        bottom: 32px;
        transform: none;
        right: 12px;
        left: auto;
    }
    #saltnet-floating-panel mdui-card {
        width: 64px;
    }
}
`;
    document.head.appendChild(style);
}

function createFloatingPanel() {
    if (document.getElementById("saltnet-floating-panel")) return;

    const container = document.createElement("div");
    container.id = "saltnet-floating-panel";

    const card = document.createElement("mdui-card");
    card.setAttribute("variant", "elevated");
    card.innerHTML = `
        <div class="header">
            <span>SaltNet Uploader</span>
            <span id="saltnet-status-text"></span>
        </div>
        <img id="saltnet-pill-icon" src="https://salt.realtvop.top/favicon.ico" alt="SaltNet" style="width:36px;height:36px;border-radius:12px;object-fit:cover;cursor:pointer;">
        <div class="actions">
            <mdui-button-icon id="saltnet-auth-btn" icon="login" variant="tonal"></mdui-button-icon>
            <mdui-button-icon id="saltnet-upload-btn" icon="upload" variant="filled"></mdui-button-icon>
        </div>
        <div class="status" id="saltnet-helper-hint"></div>
    `;

    container.appendChild(card);
    document.body.appendChild(container);

    ui.status = card.querySelector("#saltnet-status-text");
    ui.authBtn = card.querySelector("#saltnet-auth-btn");
    ui.uploadBtn = card.querySelector("#saltnet-upload-btn");
    ui.statusHint = card.querySelector("#saltnet-helper-hint");

    createLoginDialog();
    createAccountDialog();
    bindIconClick();

    ui.authBtn.addEventListener("click", handleAuthEntry);
    ui.uploadBtn.addEventListener("click", handleUpload);
}

function createLoginDialog() {
    const dialog = document.createElement("mdui-dialog");
    dialog.id = "saltnet-login-dialog";
    dialog.innerHTML = `
        <div slot="headline">Login to SaltNet</div>
        <div slot="description">Use username or email and password.</div>
        <div style="display:flex; flex-direction:column; gap:12px; margin-top:6px;">
            <mdui-text-field id="saltnet-identifier" label="Username or Email"></mdui-text-field>
            <mdui-text-field id="saltnet-password" label="Password" type="password"></mdui-text-field>
        </div>
        <mdui-button slot="action" variant="text" id="saltnet-cancel-login">Cancel</mdui-button>
        <mdui-button slot="action" variant="filled" id="saltnet-submit-login">Login</mdui-button>
    `;
    document.body.appendChild(dialog);

    ui.dialog = dialog;
    ui.identifierInput = dialog.querySelector("#saltnet-identifier");
    ui.passwordInput = dialog.querySelector("#saltnet-password");

    const cancelBtn = dialog.querySelector("#saltnet-cancel-login");
    const submitBtn = dialog.querySelector("#saltnet-submit-login");

    cancelBtn.addEventListener("click", () => (dialog.open = false));
    submitBtn.addEventListener("click", handleLogin);

    dialog.addEventListener("cancel", () => (dialog.open = false));
    dialog.addEventListener("close", () => setHelperHint(""));
}

function createAccountDialog() {
    const dialog = document.createElement("mdui-dialog");
    dialog.id = "saltnet-account-dialog";
    dialog.setAttribute("close-on-overlay-click", "true");
    dialog.setAttribute("stacked-actions", "true");
    dialog.innerHTML = `
        <div slot="headline">SaltNet Account</div>
        <div slot="description" id="saltnet-account-name">Signed in</div>
        <mdui-button slot="action" variant="filled" color="error" id="saltnet-account-logout">Logout</mdui-button>
        <mdui-button slot="action" variant="text" id="saltnet-account-close">Close</mdui-button>
    `;
    document.body.appendChild(dialog);

    ui.accountDialog = dialog;

    const closeBtn = dialog.querySelector("#saltnet-account-close");
    const logoutBtn = dialog.querySelector("#saltnet-account-logout");

    closeBtn?.addEventListener("click", () => (dialog.open = false));
    logoutBtn?.addEventListener("click", confirmLogout);
}

function bindIconClick() {
    const icon = document.getElementById("saltnet-pill-icon");
    if (!icon) return;
    icon.addEventListener("click", () => {
        try {
            window.open("https://salt.realtvop.top", "_blank", "noopener,noreferrer");
        } catch (err) {
            console.error(err);
        }
    });
}

function openLoginDialog() {
    if (!ui.dialog) return;
    ui.dialog.open = true;
    requestAnimationFrame(() => {
        try {
            ui.identifierInput?.focus();
            ui.identifierInput?.shadowRoot?.querySelector("input")?.focus();
        } catch (err) {
            console.error(err);
        }
    });
}

function openAccountDialog() {
    if (!ui.accountDialog) return;
    const nameEl = ui.accountDialog.querySelector("#saltnet-account-name");
    if (nameEl) nameEl.textContent = authState?.username || "";
    ui.accountDialog.open = true;
}

function handleAuthEntry() {
    const loggedIn = Boolean(authState?.sessionToken);
    if (loggedIn) {
        openAccountDialog();
    } else {
        openLoginDialog();
    }
}

function confirmLogout() {
    if (!window.mdui?.confirm) {
        handleLogout();
        if (ui.accountDialog) ui.accountDialog.open = false;
        return;
    }

    window.mdui.confirm({
        title: "Logout?",
        description: "Are you sure you want to logout?",
        confirmText: "Logout",
        cancelText: "Cancel",
        onConfirm: () => {
            handleLogout();
            if (ui.accountDialog) ui.accountDialog.open = false;
        },
    });
}

async function handleLogin() {
    const identifier = ui.identifierInput?.value?.trim();
    const password = ui.passwordInput?.value || "";

    if (!identifier || !password) {
        showSnackbar("Please fill all fields");
        return;
    }

    setHelperHint("Signing in...");
    const result = await loginRequest(identifier, password);
    if (result) {
        showSnackbar("Login successful");
        ui.dialog.open = false;
        ui.passwordInput.value = "";
    }
    setHelperHint("");
}

async function loginRequest(identifier, password) {
    try {
        const resp = await fetch(`${DB_API_URL}/api/v0/user/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifier, password }),
        });
        const data = await resp.json();

        if (!resp.ok) {
            showSnackbar(data?.error || "Login failed");
            return false;
        }

        const sessionExpiry = Date.now() + SESSION_DURATION;
        saveAuthState({
            id: data.user.id,
            username: data.user.userName,
            email: data.user.email,
            sessionToken: data.sessionToken,
            refreshToken: data.refreshToken,
            sessionExpiry,
        });
        return true;
    } catch (err) {
        showSnackbar("Network error");
        console.error(err);
        return false;
    }
}

async function refreshSession() {
    if (!authState?.refreshToken) return false;
    try {
        const resp = await fetch(`${DB_API_URL}/api/v0/user/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken: authState.refreshToken }),
        });
        if (!resp.ok) return false;
        const data = await resp.json();
        const sessionExpiry = Date.now() + SESSION_DURATION;
        saveAuthState({ ...authState, sessionToken: data.sessionToken, sessionExpiry });
        return true;
    } catch {
        return false;
    }
}

async function ensureSessionToken() {
    if (!authState?.sessionToken) {
        showSnackbar("Please login first");
        return null;
    }

    if (!isSessionExpired()) return authState.sessionToken;

    setHelperHint("Refreshing session...");
    const refreshed = await refreshSession();
    setHelperHint("");

    if (!refreshed) {
        showSnackbar("Session expired, please login again");
        saveAuthState(null);
        return null;
    }

    return authState.sessionToken;
}

async function handleLogout() {
    if (!authState?.sessionToken) {
        saveAuthState(null);
        return;
    }
    setHelperHint("Logging out...");
    try {
        await fetch(`${DB_API_URL}/api/v0/user/logout`, {
            method: "POST",
            headers: { Authorization: `Bearer ${authState.sessionToken}` },
        });
    } catch (err) {
        console.error(err);
    } finally {
        saveAuthState(null);
        setHelperHint("");
        showSnackbar("Logged out");
    }
}

async function handleUpload() {
    if (uploading) return;
    const token = await ensureSessionToken();
    if (!token) return;

    uploading = true;
    updateControls();
    setHelperHint("Collecting scores...");

    try {
        showSnackbar("Fetching...");
        const scores = await collectScores();
        if (!scores.length) {
            showSnackbar("No scores found");
            return;
        }
        setHelperHint("Uploading...");
        showSnackbar(`Uploading ${scores.length} scores...`);

        const resp = await fetch(`${DB_API_URL}/api/v0/maimaidx/records`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(scores),
        });

        const data = await resp.json().catch(() => ({}));

        if (!resp.ok) {
            showSnackbar(data?.error || "Upload failed");
            return;
        }

        if (typeof data.success === "number") {
            showSnackbar(`Upload done: success ${data.success}, failed ${data.failed || 0}`);
        } else {
            showSnackbar("Upload completed");
        }
    } catch (err) {
        showSnackbar("Upload error");
        console.error(err);
    } finally {
        uploading = false;
        updateControls();
        setHelperHint("");
    }
}

async function collectScores() {
    const scores = [];
    for (const difficulty of DIFFICULTIES) {
        const diffIndex = DIFFICULTIES.indexOf(difficulty);
        const url = `https://maimaidx-eng.com/maimai-mobile/record/musicSort/search/?search=A&sort=1&playCheck=on&diff=${diffIndex}`;
        try {
            const res = await fetch(url);
            const html = await res.text();
            parseMaimaiScores(html).forEach(score =>
                scores.push({
                    ...score,
                    difficulty,
                })
            );
        } catch (err) {
            console.error(`Failed to fetch ${difficulty}`, err);
        }
    }
    return scores;
}

function setHelperHint(text) {
    if (ui.statusHint) ui.statusHint.textContent = text || "";
}

function updateControls() {
    const loggedIn = Boolean(authState?.sessionToken);
    if (ui.status) {
        ui.status.textContent = loggedIn
            ? `Logged in as ${authState.username || "user"}`
            : "Not logged in";
    }
    if (ui.authBtn) ui.authBtn.disabled = uploading;
    if (ui.authBtn) ui.authBtn.setAttribute("icon", loggedIn ? "manage_accounts" : "login");
    if (ui.uploadBtn) ui.uploadBtn.disabled = !loggedIn || uploading;
}

function showSnackbar(message) {
    if (window.mdui?.snackbar) {
        window.mdui.snackbar({ message, autoCloseDelay: 2500, placement: "bottom" });
    } else {
        console.log(message);
    }
}

/**
 * Parse maimai DX HTML to extract score data
 * @param {string} [htmlString] - Optional HTML string. Defaults to document.body.innerHTML
 * @returns {Array} Array of score objects
 */
function parseMaimaiScores(htmlString) {
    const source = htmlString || document.body.innerHTML;
    const parser = new DOMParser();
    const doc = parser.parseFromString(source, 'text/html');

    // Locate all song containers (forms pointing to musicDetail)
    const forms = doc.querySelectorAll('form[action*="musicDetail"]');

    return Array.from(forms).map(form => {
        const item = {
            type: '',
            title: '',
            achievements: 0,
            dxScore: 0,
            comboStat: '',
            syncStat: ''
        };

        // Parse images for Type, Combo, and Sync status
        const imgs = form.querySelectorAll('img');
        imgs.forEach(img => {
            const src = img.src || '';
            const match = src.match(/\/([^\/]+?)\.png/); 
            if (!match) return;
            
            const fileName = match[1];

            // Determine Type (dx / std)
            if (fileName.includes('music_dx')) {
                item.type = 'dx';
            } else if (fileName.includes('music_standard')) {
                item.type = 'std';
            }

            // Determine Combo and Sync status (extract raw suffix)
            if (fileName.startsWith('music_icon_')) {
                const val = fileName.replace('music_icon_', '');
                
                if (['fc', 'fcp', 'ap', 'app'].includes(val)) {
                    item.comboStat = val;
                } else if (['fs', 'fsp', 'fdx', 'fdxp', 'sync'].includes(val)) {
                    item.syncStat = val.replace('fdx', 'fsd');
                }
            }
        });

        // Parse text for Name, Achievements, and DeluxScore
        const divs = Array.from(form.querySelectorAll('div'));
        const textItems = [];
        
        divs.forEach(div => {
            const text = div.textContent.trim();
            if (!text) return;

            // Extract DeluxScore (container has deluxscore image)
            if (div.querySelector('img[src*="deluxscore"]')) {
                const dsMatch = text.match(/([\d,]+)\s*\//);
                if (dsMatch) {
                    item.dxScore = parseInt(dsMatch[1].replace(/,/g, ''), 10);
                }
            }
            // Extract Achievements (ends with %)
            else if (text.match(/^\d+(\.\d+)?%$/)) {
                item.achievements = parseFloat(text.replace('%', ''));
            }
            // Skip Level (numbers 1-15, optional +) to avoid confusing with song name
            else if (text.match(/^([1-9]|1[0-5])\+?$/)) {
                // Ignore level text
            }
            // Collect remaining text (Song Name candidates)
            else {
                if (!text.includes('/')) { 
                    textItems.push(text);
                }
            }
        });

        // The first remaining text block is typically the song name
        if (textItems.length > 0) {
            item.title = textItems[0];
        }

        return item;
    });
}
