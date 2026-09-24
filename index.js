const manifest = { name: "Launch Curtain SteamOS" };
const API_VERSION = 2;
const internalAPIConnection = window.__DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit;
if (!internalAPIConnection) throw new Error("Launch Curtain SteamOS: Decky API unavailable");
let api;
try { api = internalAPIConnection.connect(API_VERSION, manifest.name); }
catch (_) { api = internalAPIConnection.connect(1, manifest.name); }

const callable = api.callable;
const openFilePicker = api.openFilePicker;
const toaster = api.toaster;
const definePlugin = (fn) => fn;
const R = globalThis.SP_REACT || globalThis.React;
if (!R || typeof R.createElement !== "function") throw new Error("Launch Curtain SteamOS: React runtime unavailable");
const h = R.createElement;

function FallbackScrollPanel(props) { return h("div", { style: { overflowY: "auto", maxHeight: "100%" } }, props.children); }
function FallbackToggleField(props) {
  return h("label", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 4px", fontSize: 14 } },
    h("span", null, props.label || ""),
    h("input", { type: "checkbox", checked: !!props.checked, disabled: !!props.disabled, onChange: e => props.onChange?.(!!e.target.checked), style: { width: 24, height: 24 } })
  );
}
function FallbackSliderField(props) {
  const val = Number(props.value ?? 0);
  return h("div", { style: { padding: "9px 4px" } },
    h("div", { style: { display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6, fontSize: 14 } },
      h("span", null, props.label || ""),
      props.showValue === false ? null : h("span", { style: { opacity: .75 } }, `${val}${props.valueSuffix || ""}`)
    ),
    h("input", { type: "range", min: props.min, max: props.max, step: props.step, value: val, disabled: !!props.disabled, onChange: e => props.onChange?.(Number(e.target.value)), style: { width: "100%" } })
  );
}
function FallbackDialogButton(props) {
  const { children, style, ...rest } = props;
  return h("button", { ...rest, style: { minHeight: 44, border: 0, borderRadius: 8, padding: "10px 12px", fontSize: 14, fontWeight: 700, ...style } }, children);
}
const D0 = globalThis.DFL || {};
const DFL = {
  ScrollPanel: D0.ScrollPanel || FallbackScrollPanel,
  ToggleField: D0.ToggleField || FallbackToggleField,
  SliderField: D0.SliderField || FallbackSliderField,
  DialogButton: D0.DialogButton || FallbackDialogButton,
  staticClasses: D0.staticClasses || {}
};

const getSettings = callable("get_settings");
const saveSettings = callable("save_settings");
const getImagePreview = callable("get_image_preview");
const validateLaunchImagePath = callable("validate_launch_image_path");
const platformInfo = callable("platform_info");
const getSteamGameAssets = callable("get_steam_game_assets");

const DEFAULTS = {
  enabled: true,
  show_logo: true,
  show_status: true,
  background_source: "steam",
  custom_background_path: "",
  background_opacity: 100,
  logo_scale: 100,
  timeout_seconds: 45,
  exit_delay_seconds: 1.5,
  zoom_background: true,
};

const PLAY_LABELS = new Set([
  "play", "spielen", "jouer", "jugar", "gioca", "giocare", "jogar", "spelen",
  "graj", "hrat", "pelaa", "spela", "играть", "грати", "เล่น", "プレイ", "게임 실행",
  "oyna", "启动", "啟動"
]);

const STATUS_MAP = {
  Starting: "Spiel wird gestartet …",
  CreatingProcess: "Spielprozess wird gestartet …",
  CreatedProcess: "Spielprozess gestartet …",
  LaunchApp: "Spiel wird geöffnet …",
  UpdatingAppTicket: "Lizenz wird geprüft …",
  SiteLicenseSeatCheckout: "Lizenz wird geprüft …",
  UpdatingDRM: "Lizenz wird geprüft …",
  CheckShaderDepotManifest: "Dateien werden geprüft …",
  VerifyingFiles: "Dateien werden geprüft …",
  RunningInstallScript: "Komponenten werden vorbereitet …",
  ProcessingInstallScript: "Komponenten werden vorbereitet …",
  InstallingRedistributables: "Komponenten werden installiert …",
  SynchronizingCloud: "Steam Cloud wird synchronisiert …",
  SynchronizingStats: "Spieldaten werden synchronisiert …",
  SynchronizingControllerConfig: "Controller-Konfiguration wird geladen …",
  ShowInterstitials: "Spiel wird vorbereitet …",
  WaitingForOtherOperations: "Steam wartet auf andere Vorgänge …",
  WaitingForOtherApps: "Steam wartet auf andere Anwendungen …",
  DelayLaunch: "Start wird vorbereitet …",
  WaitingOnUserPrompts: "Bestätigung wird erwartet …",
  WaitingGameWindow: "Warte auf das Spiel …",
  Updating: "Spiel wird aktualisiert …",
  Completed: "Spiel bereit …",
  Done: "Spiel bereit …",
};

const runtime = {
  settings: { ...DEFAULTS },
  customPreview: "",
  surfaces: new Map(),
  timeoutTimer: 0,
  hideTimer: 0,
  gamepadTimer: 0,
  lastB: false,
  visible: false,
  appId: 0,
  gameTitle: "",
  resolvedLogo: "",
  resolvedHero: "",
  assetAppId: 0,
  artAppId: 0,
  assetToken: 0,
  registrations: [],
  restorers: [],
  listeners: [],
  popupRegistrations: [],
  domDocs: new Map(),
  launchHandler: null,
  keyHandler: null,
};

function normalizeSettings(s) { return { ...DEFAULTS, ...(s || {}) }; }
function notify(title, body) {
  try { toaster?.toast?.({ title, body }); } catch (_) {}
}
function releaseRegistration(reg) {
  try {
    if (typeof reg === "function") reg();
    else if (reg?.Unregister) reg.Unregister();
    else if (reg?.unregister) reg.unregister();
    else if (reg?.Dispose) reg.Dispose();
    else if (reg?.dispose) reg.dispose();
  } catch (_) {}
}
function currentAppId() {
  const sources = [String(location.pathname || ""), String(location.hash || ""), String(location.href || "")];
  for (const source of sources) {
    const m = source.match(/(?:library\/(?:app\/|details\/)?|steam:\/\/nav\/games\/details\/)(\d{2,20})/i);
    if (m) { const n = Number(m[1]); if (Number.isFinite(n) && n > 0) return n; }
  }
  return 0;
}
function currentGameTitle() {
  const selectors = [
    "[class*='appdetailsplaysection'] h1", "[class*='appdetailsoverview'] h1", "[class*='AppDetails'] h1",
    "[class*='appdetails'] [class*='title']", "h1"
  ];
  for (const doc of getAllSteamDocuments()) {
    for (const sel of selectors) {
      try {
        const el = doc.querySelector(sel);
        const text = String(el?.textContent || "").trim();
        if (text && text.length < 160) return text;
      } catch (_) {}
    }
  }
  return "";
}
function extractAppId(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0 && value < 4294967296) return Math.floor(value);
  if (typeof value === "bigint" && value > 0n && value <= 0xffffffffn) return Number(value);
  if (typeof value === "string") {
    const m = value.match(/(?:appid|app_id|gameid)?\D*(\d{2,10})/i);
    if (m) { const n = Number(m[1]); if (n > 0 && n < 4294967296) return n; }
  }
  if (Array.isArray(value)) {
    for (const v of value) { const n = extractAppId(v); if (n) return n; }
  }
  if (value && typeof value === "object") {
    for (const key of ["appid","appId","appID","unAppID","nAppID","gameid","gameId","gameID"]) {
      const n = extractAppId(value[key]); if (n) return n;
    }
  }
  return 0;
}

function cleanSteamTitle(value) {
  const text = String(value ?? "").trim();
  if (!text || /^steam app \d+$/i.test(text)) return "";
  return text.length <= 220 ? text : "";
}
function titleFromObject(obj, depth = 0, seen = new Set()) {
  if (!obj || typeof obj !== "object" || depth > 4 || seen.has(obj)) return "";
  seen.add(obj);
  for (const key of ["display_name", "strDisplayName", "displayName", "app_name", "appName", "strAppName", "strName", "name", "sort_as", "sortAs"]) {
    const title = cleanSteamTitle(obj?.[key]);
    if (title) return title;
  }
  const preferred = ["overview", "appOverview", "details", "data"];
  for (const key of preferred) {
    const title = titleFromObject(obj?.[key], depth + 1, seen);
    if (title) return title;
  }
  const values = Array.isArray(obj) ? obj : Object.values(obj);
  for (const value of values.slice(0, 80)) {
    if (value && typeof value === "object") {
      const title = titleFromObject(value, depth + 1, seen);
      if (title) return title;
    }
  }
  return "";
}
function getSteamAppOverview(appId) {
  const stores = [
    globalThis.appStore, globalThis.window?.appStore,
    globalThis.SteamUIStore?.appStore, globalThis.LibraryUIStore?.appStore,
    globalThis.AppStore, globalThis.SteamAppStore
  ].filter(Boolean);
  for (const store of stores) {
    try {
      if (typeof store.GetAppOverviewByAppID === "function") {
        const ov = store.GetAppOverviewByAppID(Number(appId));
        if (ov) return ov;
      }
      if (typeof store.getAppOverviewByAppID === "function") {
        const ov = store.getAppOverviewByAppID(Number(appId));
        if (ov) return ov;
      }
      const all = store.allApps || store.m_mapApps || store.apps;
      if (all?.get) { const ov = all.get(Number(appId)) || all.get(String(appId)); if (ov) return ov; }
    } catch (_) {}
  }
  return null;
}
function resolveTitleFromAppDetails(appId, timeoutMs = 1800) {
  const A = globalThis.SteamClient?.Apps || globalThis.window?.SteamClient?.Apps;
  if (!appId || typeof A?.RegisterForAppDetails !== "function") return Promise.resolve("");
  return new Promise((resolve) => {
    let done = false;
    let reg = null;
    let timer = 0;
    const finish = (value) => {
      if (done) return;
      done = true;
      if (timer) window.clearTimeout(timer);
      const currentReg = reg;
      // Some Steam builds invoke the callback synchronously while RegisterForAppDetails
      // is still returning. Deferring disposal avoids leaking that registration.
      window.setTimeout(() => releaseRegistration(currentReg), 0);
      resolve(cleanSteamTitle(value));
    };
    try {
      reg = A.RegisterForAppDetails(Number(appId), (details) => {
        const direct = cleanSteamTitle(details?.strDisplayName);
        const nested = direct || titleFromObject(details);
        if (nested) finish(nested);
      });
      timer = window.setTimeout(() => finish(""), timeoutMs);
    } catch (_) {
      finish("");
    }
  });
}
async function resolveSteamRuntimeTitle(appId) {
  if (!appId) return "";
  let title = titleFromObject(getSteamAppOverview(appId));
  // This is the reliable SteamClient path for shortcuts. AppDetails contains
  // strDisplayName as well as strShortcutExe/strShortcutStartDir. GetCachedAppDetails
  // is metadata cache data and does not reliably contain the app display name.
  if (!title) title = await resolveTitleFromAppDetails(appId);
  const A = globalThis.SteamClient?.Apps || globalThis.window?.SteamClient?.Apps;
  if (!title && typeof A?.GetCachedAppDetails === "function") {
    try {
      const raw = await A.GetCachedAppDetails(Number(appId));
      let parsed = raw;
      if (typeof raw === "string" && raw.trim()) {
        try { parsed = JSON.parse(raw); } catch (_) {}
      }
      title = titleFromObject(parsed);
    } catch (_) {}
  }
  if (title && runtime.appId === appId) {
    runtime.gameTitle = title;
    if (runtime.visible) renderCurtain();
  }
  return title;
}

function getTask(args) {
  for (const arg of args) if (typeof arg === "string" && STATUS_MAP[arg]) return arg;
  return "";
}
function isPlayControl(target, path) {
  const list = (path?.length ? path : []).filter(x => x && x.nodeType === 1).slice(0, 10);
  if (target?.nodeType === 1 && !list.includes(target)) list.unshift(target);
  for (const el of list) {
    const role = String(el.getAttribute?.("role") || "").toLowerCase();
    if (el.tagName !== "BUTTON" && role !== "button" && el.getAttribute?.("data-focusable") !== "true") continue;
    const text = String(el.innerText || el.textContent || el.getAttribute?.("aria-label") || el.getAttribute?.("title") || "")
      .trim().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ");
    if (PLAY_LABELS.has(text)) return true;
  }
  return false;
}
function styleNode(el, styles) { Object.assign(el.style, styles); return el; }
function getAllSteamDocuments() {
  const docs = [];
  const seen = new Set();
  const push = (candidate) => {
    try {
      const doc = candidate?.document ?? candidate;
      if (!doc || typeof doc.querySelector !== "function" || !doc.documentElement || seen.has(doc)) return;
      seen.add(doc); docs.push(doc);
    } catch (_) {}
  };
  const roots = [globalThis, globalThis.window, globalThis.window?.opener].filter(Boolean);
  for (const root of roots) {
    try { push(root?.SteamUIStore?.GetFocusedWindowInstance?.()?.BrowserWindow); } catch (_) {}
    try { push(root?.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow); } catch (_) {}
    try {
      const windows = root?.SteamUIStore?.WindowStore?.SteamUIWindows;
      if (Array.isArray(windows)) windows.forEach((entry) => push(entry?.BrowserWindow));
    } catch (_) {}
    try { push(root?.Router?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow); } catch (_) {}
    try {
      const manager = root?.g_PopupManager;
      const popups = Array.from(manager?.GetPopups?.() ?? manager?.m_mapPopups?.values?.() ?? []);
      popups.forEach((entry) => {
        push(entry?.m_popup); push(entry?.m_popup?.window); push(entry?.m_element?.ownerDocument);
      });
    } catch (_) {}
  }
  try { push(document); } catch (_) {}
  try { push(window); } catch (_) {}
  return docs;
}
function createSurface(doc) {
  const root = styleNode(doc.createElement("div"), {
    position: "fixed", inset: "0", zIndex: "2147483647", background: "#000", display: "none",
    alignItems: "center", justifyContent: "center", overflow: "hidden", pointerEvents: "none",
    fontFamily: "Motiva Sans, Arial, sans-serif", color: "white", visibility: "hidden", opacity: "0",
    isolation: "isolate", transform: "translateZ(0)"
  });
  root.className = "launch-curtain-steamos-surface";
  root.setAttribute("data-launch-curtain-steamos", "true");
  root.setAttribute("aria-hidden", "true");
  const bg = styleNode(doc.createElement("div"), {
    position: "absolute", inset: "-3%", backgroundColor: "#050607", backgroundPosition: "center",
    backgroundSize: "cover", backgroundRepeat: "no-repeat", opacity: "1", transform: "scale(1.045)",
    transition: "transform 8s ease-out, opacity .35s ease"
  });
  const shade = styleNode(doc.createElement("div"), {
    position: "absolute", inset: "0", background: "linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.58))"
  });
  const box = styleNode(doc.createElement("div"), {
    position: "relative", zIndex: "2", width: "min(70vw, 760px)", display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: "18px", textAlign: "center", padding: "28px"
  });
  const logo = styleNode(doc.createElement("img"), {
    maxWidth: "min(58vw, 620px)", maxHeight: "220px", objectFit: "contain", filter: "drop-shadow(0 5px 22px rgba(0,0,0,.85))",
    display: "none", transformOrigin: "center"
  });
  logo.alt = "Game logo";
  const title = styleNode(doc.createElement("div"), {
    fontSize: "clamp(26px, 3.3vw, 46px)", lineHeight: "1.05", fontWeight: "800", textShadow: "0 3px 18px rgba(0,0,0,.9)",
    maxWidth: "92vw", display: "none"
  });

  const status = styleNode(doc.createElement("div"), {
    fontSize: "clamp(16px, 1.5vw, 22px)", opacity: ".9", textShadow: "0 2px 10px rgba(0,0,0,.9)", minHeight: "28px"
  });
  const spinner = styleNode(doc.createElement("div"), {
    width: "42px", height: "42px", border: "4px solid rgba(255,255,255,.26)", borderTopColor: "#fff",
    borderRadius: "50%", animation: "lcso-spin .85s linear infinite"
  });
  const style = doc.createElement("style");
  style.textContent = "@keyframes lcso-spin{to{transform:rotate(360deg)}}";
  root.append(style, bg, shade, box); box.append(logo, title, spinner, status);
  doc.documentElement.appendChild(root);
  const surface = { doc, root, bg, logo, title, status, spinner, logoCandidates: [], logoCandidateIndex: -1 };
  logo.addEventListener("error", () => logoFallback(surface));
  runtime.surfaces.set(doc, surface);
  attachDomHooks(doc);
  return surface;
}
function ensureSurfaces() {
  for (const [doc, surface] of Array.from(runtime.surfaces.entries())) {
    if (!surface?.root?.isConnected || !doc?.documentElement?.isConnected) {
      detachDomHooks(doc); try { surface?.root?.remove?.(); } catch (_) {} runtime.surfaces.delete(doc);
    }
  }
  for (const doc of getAllSteamDocuments()) {
    try {
      const existing = runtime.surfaces.get(doc);
      for (const stale of Array.from(doc.querySelectorAll('[data-launch-curtain-steamos="true"]'))) {
        if (existing?.root === stale) continue;
        try { stale.remove(); } catch (_) {}
      }
      if (!existing?.root?.isConnected) createSurface(doc); else attachDomHooks(doc);
    } catch (e) { console.warn("Launch Curtain SteamOS: could not create Steam surface", e); }
  }
  return Array.from(runtime.surfaces.values()).filter(s => s.root?.isConnected);
}
function registerPopupHooks() {
  const manager = globalThis.g_PopupManager;
  if (!manager) return;
  const keep = (r) => { if (r) runtime.popupRegistrations.push(r); };
  try {
    if (typeof manager.AddPopupCreatedCallback === "function") keep(manager.AddPopupCreatedCallback(() => {
      window.setTimeout(() => { ensureSurfaces(); if (runtime.visible) renderCurtain(); }, 0);
    }));
    if (typeof manager.AddPopupDestroyedCallback === "function") keep(manager.AddPopupDestroyedCallback(() => {
      window.setTimeout(() => ensureSurfaces(), 0);
    }));
  } catch (_) {}
}
function ensureOverlay() { return ensureSurfaces()[0]?.root || null; }

function steamHero(appId) { return appId ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_hero.jpg` : ""; }
function steamLogoCandidates(appId) {
  if (!appId) return [];
  return [
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/logo.png`,
    `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/logo.png`,
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}/logo.png`,
    `https://steamcdn-a.akamaihd.net/steam/apps/${appId}/logo.png`,
  ];
}
function logoFallback(surface) {
  const { logo, title } = surface;
  const candidates = surface.logoCandidates || [];
  const next = (surface.logoCandidateIndex ?? -1) + 1;
  if (next < candidates.length) {
    surface.logoCandidateIndex = next;
    logo.src = candidates[next];
    logo.style.display = "block";
    title.style.display = "none";
    return;
  }
  logo.style.display = "none";
  title.textContent = runtime.gameTitle || (runtime.appId ? `Steam App ${runtime.appId}` : "Spiel wird gestartet");
  title.style.display = "block";
}
async function resolveGameAssets(appId) {
  if (!appId) return;
  if (runtime.assetAppId !== appId) {
    runtime.assetAppId = appId;
    runtime.artAppId = appId;
    runtime.resolvedLogo = "";
    runtime.resolvedHero = "";
  }
  const token = ++runtime.assetToken;
  try {
    // Steam's live appStore knows the display name of non-Steam shortcuts even when the
    // backend cannot map shortcuts.vdf. Use it as the primary title hint.
    const liveTitle = runtime.gameTitle || await resolveSteamRuntimeTitle(appId);
    const result = await getSteamGameAssets(appId, liveTitle || "");
    if (token !== runtime.assetToken || runtime.appId !== appId) return;
    if (result?.title) runtime.gameTitle = String(result.title);
    else if (liveTitle) runtime.gameTitle = liveTitle;
    runtime.artAppId = Number(result?.art_app_id || appId) || appId;
    runtime.resolvedLogo = String(result?.logo || "");
    runtime.resolvedHero = String(result?.hero || "");
    if (runtime.visible) renderCurtain();
  } catch (e) {
    console.warn("Launch Curtain SteamOS: local Steam artwork lookup failed", e);
    void resolveSteamRuntimeTitle(appId);
  }
}
function renderCurtain() {
  const s = runtime.settings;
  const appId = runtime.appId;
  const artAppId = runtime.artAppId || appId;
  const gameTitle = runtime.gameTitle;
  for (const surface of ensureSurfaces()) {
    const { root, bg, logo, title, status } = surface;
    bg.style.opacity = String(Math.max(0, Math.min(100, Number(s.background_opacity) || 0)) / 100);
    bg.style.transition = "none";
    bg.style.transform = s.zoom_background ? "scale(1.045)" : "scale(1)";
    if (s.background_source === "black") bg.style.backgroundImage = "none";
    else if (s.background_source === "custom" && runtime.customPreview) bg.style.backgroundImage = `url(${JSON.stringify(runtime.customPreview)})`;
    else if (runtime.resolvedHero) bg.style.backgroundImage = `url(${JSON.stringify(runtime.resolvedHero)})`;
    else if (artAppId) bg.style.backgroundImage = `url(${JSON.stringify(steamHero(artAppId))})`;
    else bg.style.backgroundImage = "none";

    surface.logoCandidateIndex = -1;
    surface.logoCandidates = [];
    if (s.show_logo && (appId || artAppId)) {
      if (runtime.resolvedLogo) surface.logoCandidates.push(runtime.resolvedLogo);
      surface.logoCandidates.push(...steamLogoCandidates(artAppId));
      logo.style.transform = `scale(${Math.max(.5, Math.min(1.6, Number(s.logo_scale || 100) / 100))})`;
      logoFallback(surface);
    } else {
      logo.style.display = "none";
      title.textContent = gameTitle || (appId ? `Steam App ${appId}` : "Spiel wird gestartet");
      title.style.display = "block";
    }
    status.style.display = s.show_status ? "block" : "none";
    root.style.display = "flex"; root.style.visibility = "visible"; root.style.opacity = "1"; root.setAttribute("aria-hidden", "false");
    root.getBoundingClientRect();
    requestAnimationFrame(() => {
      bg.style.transition = "transform 8s ease-out, opacity .35s ease";
      if (runtime.visible && s.zoom_background) bg.style.transform = "scale(1)";
    });
  }
}
function applyAppearance(appId, gameTitle) {
  runtime.appId = appId || runtime.appId || currentAppId();
  runtime.gameTitle = gameTitle || runtime.gameTitle || currentGameTitle();
  if (runtime.visible) renderCurtain();
}
function updateStatus(text) {
  for (const surface of ensureSurfaces()) surface.status.textContent = text || "Spiel wird gestartet …";
}
function clearTimers() {
  if (runtime.timeoutTimer) window.clearTimeout(runtime.timeoutTimer);
  if (runtime.hideTimer) window.clearTimeout(runtime.hideTimer);
  runtime.timeoutTimer = 0; runtime.hideTimer = 0;
}
function showCurtain(appId = 0, title = "", statusText = "Spiel wird gestartet …") {
  if (!runtime.settings.enabled) return;
  clearTimers(); runtime.visible = true;
  const previousAppId = runtime.appId;
  const detectedAppId = appId || currentAppId() || previousAppId;
  if (detectedAppId !== previousAppId) {
    runtime.resolvedLogo = ""; runtime.resolvedHero = ""; runtime.assetAppId = detectedAppId || 0; runtime.artAppId = detectedAppId || 0;
  }
  runtime.appId = detectedAppId;
  runtime.gameTitle = title || currentGameTitle() || (detectedAppId === previousAppId ? runtime.gameTitle : "");
  renderCurtain(); updateStatus(statusText);
  if (runtime.appId) {
    void resolveSteamRuntimeTitle(runtime.appId);
    void resolveGameAssets(runtime.appId);
  }
  const timeout = Math.max(10, Math.min(120, Number(runtime.settings.timeout_seconds) || 45));
  runtime.timeoutTimer = window.setTimeout(() => hideCurtain("timeout"), timeout * 1000);
}
function hideCurtain(_reason = "manual") {
  clearTimers(); runtime.visible = false; runtime.assetToken++; runtime.appId = 0; runtime.gameTitle = "";
  runtime.resolvedLogo = ""; runtime.resolvedHero = ""; runtime.assetAppId = 0; runtime.artAppId = 0;
  for (const surface of Array.from(runtime.surfaces.values())) {
    try {
      surface.root.style.display = "none"; surface.root.style.visibility = "hidden"; surface.root.style.opacity = "0";
      surface.root.setAttribute("aria-hidden", "true");
    } catch (_) {}
  }
}

function scheduleHide() {
  if (!runtime.visible) return;
  if (runtime.hideTimer) window.clearTimeout(runtime.hideTimer);
  const delay = Math.max(0, Math.min(8, Number(runtime.settings.exit_delay_seconds) || 0));
  runtime.hideTimer = window.setTimeout(() => hideCurtain("game-action-end"), delay * 1000);
}
async function refreshCustomPreview() {
  runtime.customPreview = "";
  const path = String(runtime.settings.custom_background_path || "");
  if (!path) return;
  try {
    const result = await getImagePreview(path);
    if (result?.ok && result?.url) runtime.customPreview = result.url;
  } catch (_) {}
}
async function loadRuntimeSettings() {
  try { runtime.settings = normalizeSettings(await getSettings()); } catch (_) { runtime.settings = { ...DEFAULTS }; }
  await refreshCustomPreview();
}
function registerSteamEvents() {
  const A = window.SteamClient?.Apps || globalThis.SteamClient?.Apps;
  if (!A) { console.warn("Launch Curtain SteamOS: SteamClient.Apps unavailable"); return; }
  const keep = (r) => { if (r) runtime.registrations.push(r); return r; };
  try {
    if (typeof A.RegisterForGameActionStart === "function") keep(A.RegisterForGameActionStart((gameActionId, appId, action) => {
      const id = extractAppId(appId) || currentAppId();
      showCurtain(id, "", "Spiel wird gestartet …");
    }));
    if (typeof A.RegisterForGameActionTaskChange === "function") keep(A.RegisterForGameActionTaskChange((...args) => {
      const task = getTask(args); if (task) updateStatus(STATUS_MAP[task]);
      if ((task === "Completed" || task === "Done") && runtime.visible) scheduleHide();
    }));
    if (typeof A.RegisterForGameActionEnd === "function") keep(A.RegisterForGameActionEnd(() => {
      if (runtime.visible) { updateStatus("Spiel bereit …"); scheduleHide(); }
    }));
  } catch (e) { console.warn("Launch Curtain SteamOS: Steam event registration failed", e); }

  for (const method of ["RunGame", "RunGameAndWaitForInstaller", "RunShortcut"]) {
    try {
      if (typeof A[method] !== "function") continue;
      const original = A[method].__lcsoOriginal || A[method];
      const wrapped = function(...args) {
        const appId = extractAppId(args) || currentAppId();
        showCurtain(appId, "", "Spiel wird gestartet …");
        return original.apply(this, args);
      };
      wrapped.__lcsoOriginal = original;
      A[method] = wrapped;
      runtime.restorers.push(() => { try { if (A[method] === wrapped) A[method] = original; } catch (_) {} });
    } catch (e) { console.warn(`Launch Curtain SteamOS: could not patch ${method}`, e); }
  }
}
function attachDomHooks(doc) {
  if (!doc || runtime.domDocs.has(doc) || !runtime.launchHandler || !runtime.keyHandler) return;
  try {
    doc.addEventListener("pointerdown", runtime.launchHandler, true);
    doc.addEventListener("mousedown", runtime.launchHandler, true);
    doc.addEventListener("touchstart", runtime.launchHandler, true);
    doc.addEventListener("keydown", runtime.keyHandler, true);
    runtime.domDocs.set(doc, true);
  } catch (_) {}
}
function detachDomHooks(doc) {
  if (!doc || !runtime.domDocs.has(doc)) return;
  try {
    doc.removeEventListener("pointerdown", runtime.launchHandler, true);
    doc.removeEventListener("mousedown", runtime.launchHandler, true);
    doc.removeEventListener("touchstart", runtime.launchHandler, true);
    doc.removeEventListener("keydown", runtime.keyHandler, true);
  } catch (_) {}
  runtime.domDocs.delete(doc);
}
function registerDomHooks() {
  runtime.launchHandler = (ev) => {
    if (!runtime.settings.enabled || runtime.visible) return;
    const path = typeof ev.composedPath === "function" ? ev.composedPath() : [];
    if (!isPlayControl(ev.target, path)) return;
    showCurtain(currentAppId(), currentGameTitle(), "Spiel wird gestartet …");
  };
  runtime.keyHandler = (ev) => {
    if (runtime.visible && (ev.key === "Escape" || ev.key === "BrowserBack" || ev.keyCode === 27)) {
      ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); hideCurtain("keyboard"); return;
    }
    if ((ev.key === "Enter" || ev.key === " ") && !runtime.visible) runtime.launchHandler(ev);
  };
  for (const doc of getAllSteamDocuments()) attachDomHooks(doc);
  ensureSurfaces(); registerPopupHooks();
  runtime.gamepadTimer = window.setInterval(() => {
    ensureSurfaces();
    if (!runtime.visible || !navigator.getGamepads) { runtime.lastB = false; return; }
    try {
      const pads = Array.from(navigator.getGamepads()).filter(Boolean);
      const b = pads.some(p => Boolean(p?.buttons?.[1]?.pressed));
      if (b && !runtime.lastB) hideCurtain("gamepad-b");
      runtime.lastB = b;
    } catch (_) {}
  }, 250);
}
function cleanupRuntime() {
  clearTimers(); hideCurtain("unload");
  runtime.registrations.splice(0).forEach(releaseRegistration);
  runtime.popupRegistrations.splice(0).forEach(releaseRegistration);
  runtime.restorers.splice(0).forEach(fn => { try { fn(); } catch (_) {} });
  runtime.listeners.splice(0).forEach(fn => { try { fn(); } catch (_) {} });
  for (const doc of Array.from(runtime.domDocs.keys())) detachDomHooks(doc);
  if (runtime.gamepadTimer) window.clearInterval(runtime.gamepadTimer);
  runtime.gamepadTimer = 0;
  for (const surface of Array.from(runtime.surfaces.values())) { try { surface.root?.remove?.(); } catch (_) {} }
  runtime.surfaces.clear(); runtime.launchHandler = null; runtime.keyHandler = null;
}

function SectionTitle({ children }) {
  return h("div", { style: { fontSize: "14px", fontWeight: 800, margin: "12px 0 6px", opacity: .95 } }, children);
}
function Help({ children }) {
  return h("div", { style: { fontSize: "11px", lineHeight: "15px", opacity: .65, margin: "-2px 2px 8px" } }, children);
}
function Content() {
  const [settings, setSettingsState] = R.useState(null);
  const [info, setInfo] = R.useState(null);
  const [busy, setBusy] = R.useState(false);
  const load = R.useCallback(async () => {
    try {
      const s = normalizeSettings(await getSettings());
      setSettingsState(s); runtime.settings = s; await refreshCustomPreview();
      try { setInfo(await platformInfo()); } catch (_) {}
    } catch (e) { console.warn(e); }
  }, []);
  R.useEffect(() => { void load(); }, [load]);
  const patch = async (partial) => {
    if (!settings) return;
    const optimistic = { ...settings, ...partial };
    setSettingsState(optimistic); runtime.settings = optimistic;
    try {
      const saved = normalizeSettings(await saveSettings(optimistic));
      setSettingsState(saved); runtime.settings = saved;
      if (Object.prototype.hasOwnProperty.call(partial, "custom_background_path") || Object.prototype.hasOwnProperty.call(partial, "background_source")) await refreshCustomPreview();
      if (!saved.enabled) hideCurtain("disabled");
    } catch (e) { console.warn(e); void load(); }
  };
  const chooseImage = async () => {
    if (!settings) return; setBusy(true);
    try {
      const start = settings.custom_background_path || "/home/deck";
      const picked = await openFilePicker(0, start, true, false, undefined, undefined, false, true);
      const path = picked?.realpath || picked?.path || "";
      if (!path) return;
      const valid = await validateLaunchImagePath(path);
      if (!valid?.ok) { notify("Launch Curtain SteamOS", valid?.message || "Ungültige Bilddatei"); return; }
      await patch({ custom_background_path: valid.path || path, background_source: "custom" });
    } catch (e) { console.warn(e); notify("Launch Curtain SteamOS", "Bild konnte nicht ausgewählt werden."); }
    finally { setBusy(false); }
  };
  if (!settings) return h("div", { style: { padding: 14 } }, "Einstellungen werden geladen …");
  const sourceLabel = settings.background_source === "steam" ? "Steam-Artwork" : settings.background_source === "custom" ? "Eigenes Bild" : "Schwarz";
  const cycleSource = () => patch({ background_source: settings.background_source === "steam" ? "custom" : settings.background_source === "custom" ? "black" : "steam" });
  return h(DFL.ScrollPanel || "div", null,
    h("div", { style: { padding: "6px 10px 18px" } },
      h(DFL.ToggleField, { label: "Launch Curtain aktivieren", checked: !!settings.enabled, onChange: v => void patch({ enabled: v }) }),
      h(Help, null, "SteamOS-native Modern-Variante: Der Curtain läuft direkt in Steam Game Mode, ohne Windows-Overlay oder PowerShell."),
      h(SectionTitle, null, "Darstellung"),
      h(DFL.ToggleField, { label: "Spiel-Logo anzeigen", checked: !!settings.show_logo, onChange: v => void patch({ show_logo: v }) }),
      h(DFL.SliderField, { label: "Logo-Größe", value: Number(settings.logo_scale), min: 50, max: 160, step: 5, valueSuffix: "%", showValue: true, disabled: !settings.show_logo, onChange: v => void patch({ logo_scale: v }) }),
      h(DFL.ToggleField, { label: "Launch-Status anzeigen", checked: !!settings.show_status, onChange: v => void patch({ show_status: v }) }),
      h(DFL.ToggleField, { label: "Hintergrund sanft herauszoomen", checked: !!settings.zoom_background, onChange: v => void patch({ zoom_background: v }) }),
      h(DFL.SliderField, { label: "Hintergrund-Deckkraft", value: Number(settings.background_opacity), min: 0, max: 100, step: 5, valueSuffix: "%", showValue: true, onChange: v => void patch({ background_opacity: v }) }),
      h(DFL.DialogButton, { focusable: true, disabled: busy, onClick: cycleSource, style: { width: "100%", marginTop: 6 } }, `Hintergrund: ${sourceLabel}`),
      h(DFL.DialogButton, { focusable: true, disabled: busy, onClick: () => void chooseImage(), style: { width: "100%", marginTop: 6 } }, settings.custom_background_path ? "Eigenes Hintergrundbild ändern" : "Eigenes Hintergrundbild auswählen"),
      settings.custom_background_path ? h(Help, null, settings.custom_background_path) : null,
      h(SectionTitle, null, "Übergabe an das Spiel"),
      h(DFL.SliderField, { label: "Maximale Anzeigedauer", value: Number(settings.timeout_seconds), min: 10, max: 120, step: 5, valueSuffix: " s", showValue: true, onChange: v => void patch({ timeout_seconds: v }) }),
      h(DFL.SliderField, { label: "Ausblend-Verzögerung", value: Number(settings.exit_delay_seconds), min: 0, max: 8, step: .5, valueSuffix: " s", showValue: true, onChange: v => void patch({ exit_delay_seconds: v }) }),
      h(Help, null, "Der Curtain wird nach Steams GameAction-Ende ausgeblendet. Zusätzlich verhindert der Timeout ein Hängenbleiben."),
      h(DFL.DialogButton, { focusable: true, onClick: () => showCurtain(currentAppId(), currentGameTitle() || "Vorschau", "SteamOS Launch Curtain – Vorschau"), style: { width: "100%", marginTop: 6 } }, "Curtain testen"),
      info ? h(Help, null, `Backend: ${info.platform || "Linux"}${info.gamescope ? " • Game Mode/Gamescope erkannt" : ""}`) : null,
      h("div", { style: { marginTop: 12, opacity: .55, fontSize: 10 } }, "Launch Curtain SteamOS v1.0.7 • AppDetails-Namen + Non-Steam Artwork-Suche")
    )
  );
}

const plugin = definePlugin(() => {
  void loadRuntimeSettings();
  ensureOverlay();
  registerSteamEvents();
  registerDomHooks();
  return {
    name: "Launch Curtain SteamOS",
    titleView: h("div", { className: DFL.staticClasses?.Title, style: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 7, width: "100%", paddingRight: 8 } }, h("span", { style: { fontSize: 18 } }, "▣"), h("span", null, "Launch Curtain SteamOS")),
    content: h(Content),
    icon: h("span", { style: { fontSize: 18, fontWeight: 900 } }, "▣"),
    alwaysRender: true,
    onDismount() { cleanupRuntime(); console.log("Launch Curtain SteamOS unloaded"); }
  };
});

export { plugin as default };
