// ==UserScript==
// @name         Nyaa AnimeTosho Extender ION Fork
// @version      1.1.0
// @description  Extends Nyaa view page with AnimeTosho information
// @author       ION
// @original-author Jimbo
// @original-source https://gitea.com/Jimbo/PT-Userscripts/src/branch/main/nyaa-animetosho.user.js
// @downloadURL  https://github.com/IONI0/Nyaa-AnimeTosho-Extender-ION-Fork/raw/refs/heads/main/Nyaa-AnimeTosho-Extender-ION-Fork.user.js
// @updateURL    https://github.com/IONI0/Nyaa-AnimeTosho-Extender-ION-Fork/raw/refs/heads/main/Nyaa-AnimeTosho-Extender-ION-Fork.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.registerMenuCommand
// @require      https://cdn.jsdelivr.net/npm/xz-decompress@0.2.3/dist/package/xz-decompress.min.js
// @match        https://nyaa.si/view/*
// @run-at       document-end
// ==/UserScript==


// (apologies for ai code, I don't know js or html)

const defaultSettings = {
    settingsPosition: "navbar", // "navbar" or "user dropdown"
    anidb: false,
    myanimelist: false,
    anilist: true,
    animetosho: true,
    nekobt: true,
    fileinfoMode: "panel", // "no", "item", "panel", or "both"
    fileinfoPanel: "hide", // "hide" or "show" (panel collapse state)
    fileinfoHeight: 300,
    panelLayout: [
        { type: "panel", key: "description" },
        { type: "panel", key: "filelist" },
        { type: "group", title: "AnimeTosho Features", panels: ["fileinfo", "screenshots", "attachments"] },
        { type: "panel", key: "comments" },
    ],
    description: "show", // "no", "hide", or "show"
    descriptionHeader: false,
    nzb: false,
    sabUrl: "http://ip:port/",
    nzbKey: "",
    screenshots: "hide", // "no", "hide", or "show"
    previewSize: "compact", // "compact", "medium", "large", "huge"
    subsByDefault: "first-nonforced", // "no", "first", "first-nonforced"
    attachments: "show", // "no", "hide", or "show"
    filtersByDefault: false,
    attachmentAction: "view", // "view", "download", "download extracted"
    highlighterCharCap: 100000, // Under this amount of characters, the highlighter will be enabled by default when viewing
    highlighterStyle: "felipec", // highlight.js style name
    languageFilters: ["en", "eng", "enm", "und"],
}

let settings = {}
const groupTabState = window.__nyatGroupTabs || (window.__nyatGroupTabs = {});
const groupKnownPanels = window.__nyatGroupKnownPanels || (window.__nyatGroupKnownPanels = {});
const panelKeys = ["description", "filelist", "fileinfo", "screenshots", "attachments", "comments"];
const panelLabels = {
    description: 'Description',
    filelist: 'File List',
    fileinfo: 'FileInfo',
    screenshots: 'Screenshots',
    attachments: 'Attachments',
    comments: 'Comments',
};



function createDefaultPanelLayout() {
    const layout = defaultSettings.panelLayout || panelKeys.map(key => ({ type: 'panel', key }));
    return clonePanelLayout(layout);
}
function makeUniqueGroupTitle(title, usedTitles) {
    const base = (title || '').trim() || 'Group';
    let unique = base;
    let idx = 2;
    while (usedTitles.has(unique)) {
        unique = `${base} (${idx})`;
        idx += 1;
    }
    usedTitles.add(unique);
    return unique;
}
function clonePanelLayout(layout) {
    return (Array.isArray(layout) ? layout : []).map(item => {
        if (item && item.type === 'group') {
            return {
                type: 'group',
                title: item.title || 'Group',
                panels: Array.isArray(item.panels) ? [...item.panels] : [],
            };
        }
        if (typeof item === 'string') {
            return { type: 'panel', key: item };
        }
        return { type: 'panel', key: item?.key };
    }).filter(item => item.type === 'group' ? item.panels.length > 0 : !!item.key);
}
function normalizePanelLayout(layout) {
    const knownKeys = new Set(panelKeys);
    const usedKeys = new Set();
    const usedGroupTitles = new Set();
    const normalized = [];
    const addPanel = (key) => {
        if (!knownKeys.has(key) || usedKeys.has(key)) return;
        usedKeys.add(key);
        normalized.push({ type: 'panel', key });
    };
    const addGroup = (group) => {
        const panels = [];
        (Array.isArray(group?.panels) ? group.panels : []).forEach(key => {
            if (!knownKeys.has(key) || usedKeys.has(key)) return;
            usedKeys.add(key);
            panels.push(key);
        });
        if (panels.length) {
            normalized.push({
                type: 'group',
                title: makeUniqueGroupTitle(group?.title, usedGroupTitles),
                panels,
            });
        }
    };
    if (Array.isArray(layout)) {
        layout.forEach(item => {
            if (typeof item === 'string') {
                addPanel(item);
            } else if (item && item.type === 'group') {
                addGroup(item);
            } else if (item && typeof item.key === 'string') {
                addPanel(item.key);
            }
        });
    }
    panelKeys.forEach(addPanel);
    return normalized;
}
// Inject shared stylesheet once — all dynamic panel/modal CSS lives here
; (function injectNyatStyles() {
    if (document.getElementById('nyat-styles')) return;
    const s = document.createElement('style');
    s.id = 'nyat-styles';
    s.textContent = `
        /* ── Panel headings ───────────────────────────────────────── */
        .nyat-panel-heading {
            display: flex; align-items: center; padding: 10px 15px;
            max-height: 80px; overflow: hidden; cursor: pointer;
        }
        .nyat-panel-heading-fixed {
            height: 45px;
        }
        .nyat-panel-title {
            margin: 0; font-size: 16px; font-weight: 500;
        }
        /* Title fills space only when it's a direct flex child of heading */
        .nyat-panel-heading > .nyat-panel-title { flex-grow: 1; }
        .nyat-panel-left {
            display: flex; align-items: center; flex-grow: 1;
        }
        .nyat-chevron {
            transition: transform 0.2s; margin-left: 10px; flex-shrink: 0;
        }
        /* ── Screenshot grid ─────────────────────────────────────── */
        .nyat-screenshot-thumb {
            position: relative; width: 100%; overflow: hidden;
            border-radius: 4px; cursor: pointer;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .nyat-screenshot-thumb:hover { box-shadow: 0 4px 8px rgba(0,0,0,0.2); }
        .nyat-screenshot-thumb img {
            position: absolute; top: 0; left: 0;
            width: 100%; height: 100%; object-fit: contain;
        }
        .nyat-screenshot-overlay {
            position: absolute; top: 0; left: 0; right: 0;
            padding: 4px 8px; background: rgba(0,0,0,0.5);
            color: white; font-size: 11px;
            opacity: 0; transition: opacity 0.2s;
        }
        .nyat-screenshot-thumb:hover .nyat-screenshot-overlay { opacity: 1; }
        /* ── Screenshot modal ────────────────────────────────────── */
        #screenshot-modal {
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.9); z-index: 10000;
            display: flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .nyat-modal-content {
            position: relative; width: 100%; height: 100%;
            display: flex; flex-direction: column; cursor: default;
        }
        .nyat-modal-topbar {
            position: fixed; top: 15px; left: 15px; right: 15px;
            min-height: 40px; display: flex; justify-content: space-between;
            align-items: center; z-index: 10001; cursor: default;
        }
        .nyat-modal-title {
            color: white; font-size: 16px; max-width: 80%;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            cursor: default; display: flex; flex-direction: column;
            align-items: flex-start; justify-content: center;
        }
        .nyat-modal-ep-title {
            font-weight: 700; font-size: 16px; overflow: hidden;
            text-overflow: ellipsis; white-space: nowrap;
            line-height: 1.2; padding-bottom: 2px; width: 100%;
        }
        .nyat-modal-screenshot-title {
            font-weight: 400; font-size: 14px; overflow: hidden;
            text-overflow: ellipsis; white-space: nowrap;
            opacity: 0.6; line-height: 1.2; padding-top: 2px; width: 100%;
        }
        .nyat-modal-btns { display: flex; gap: 8px; cursor: default; }
        .nyat-modal-btn {
            background: rgba(255,255,255,0.1); color: white;
            border: 1px solid rgba(255,255,255,0.3); padding: 8px;
            border-radius: 6px; cursor: pointer; display: flex;
            align-items: center; justify-content: center;
            width: 40px; height: 40px; transition: background 0.2s, border-color 0.2s;
        }
        .nyat-modal-btn:hover {
            background: rgba(255,255,255,0.15);
            border-color: rgba(255,255,255,0.4);
        }
        .nyat-modal-image-wrap {
            position: relative; display: flex;
            align-items: center; justify-content: center;
            flex: 1; min-height: 60px;
            margin: 65px 70px 45px 65px;
        }
        .nyat-modal-image-wrap img {
            max-width: 100%; max-height: 100%; object-fit: contain;
            border-radius: 6px; box-shadow: 0 8px 32px rgba(0,0,0,0.6);
            opacity: 0; transition: opacity 0.3s ease;
        }
        .nyat-modal-arrow {
            position: fixed; top: 50%; transform: translateY(-50%);
            background: rgba(255,255,255,0.1); color: white;
            border: 1px solid rgba(255,255,255,0.3); padding: 12px;
            border-radius: 8px; cursor: pointer; font-size: 16px;
            width: 40px; height: 40px; display: flex;
            align-items: center; justify-content: center;
            transition: background 0.2s, border-color 0.2s; z-index: 10001;
        }
        .nyat-modal-arrow:hover {
            background: rgba(255,255,255,0.15);
            border-color: rgba(255,255,255,0.4);
        }
        .nyat-modal-arrow-left  { left: 15px; }
        .nyat-modal-arrow-right { right: 15px; }
        .nyat-modal-dots {
            position: fixed; bottom: 15px; left: 50%; transform: translateX(-50%);
            display: flex; justify-content: center; align-items: center;
            z-index: 10001; cursor: default;
        }
        .nyat-dots-inner {
            display: flex; gap: 8px; background: rgba(255,255,255,0.1);
            padding: 4px 8px; border-radius: 20px;
            border: 1px solid rgba(255,255,255,0.2); cursor: default;
        }
        .nyat-dot {
            width: 10px; height: 10px; border-radius: 50%; border: none;
            cursor: pointer; transition: background-color 0.2s, transform 0.2s;
            background-color: rgba(255,255,255,0.4); margin: 0; padding: 0; display: block;
        }
        .nyat-dot.active { background-color: white; transform: scale(1.2); }
        /* ── FileInfo panel ──────────────────────────────────────── */
        .nyat-pre {
            margin: 0; padding: 15px; overflow-y: auto;
            white-space: pre-wrap; word-wrap: break-word;
            font-size: 12px; box-shadow: none; border: none; border-radius: 0;
        }
        .nyat-drag-handle {
            height: 6px; cursor: ns-resize; display: flex;
            align-items: center; justify-content: center;
            user-select: none; flex-shrink: 0;
        }
        .nyat-drag-grip {
            width: 40px; height: 3px; border-radius: 2px; opacity: 0.3;
        }
        /* ── Track selector ─────────────────────────────────────── */
        .nyat-track-selector {
            margin-left: 10px; padding: 2px 6px; font-size: 12px;
            border-radius: 3px; cursor: pointer; min-height: 24px;
            height: auto; line-height: 1.4;
        }
        /* ── Panel grouping ─────────────────────────────────────── */
        .nyat-panel-group {
            overflow: hidden;
        }
        .nyat-group-heading {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            gap: 6px;
            cursor: default;
            max-height: none;
            padding: 0;
            height: 46.85px;
        }
        .nyat-group-heading.nyat-panel-heading { padding: 0; }
        .nyat-group-title-row {
            display: none;
        }
        .nyat-group-title {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
        }
        .nyat-group-tabs {
            display: flex;
            align-items: center;
            flex: 1 1 auto;
            flex-wrap: nowrap;
            gap: 0;
            margin: 0;
            padding: 0;
            min-width: 0;
            background: transparent;
            overflow-x: auto;
            overflow-y: hidden;
            scrollbar-width: none;
            -ms-overflow-style: none;
        }
        .nyat-group-tabs::-webkit-scrollbar {
            display: none;
        }
        .nyat-group-tabbar {
            display: flex;
            align-items: center;
            gap: 8px;
            background: #434343;
            border-bottom: 1px solid #4a4a4a;
            padding: 0;
        }
        .nyat-group-tabbar .nyat-chevron {
            margin-left: auto;
            padding: 0 12px;
            flex: 0 0 auto;
        }
        .nyat-group-tab {
            flex: 0 0 auto;
            border: none;
            box-shadow: inset 0 -4px 0 transparent;
            border-radius: 0;
            font-size: 16px;
            font-weight: 500;
            padding: 12px 16px;
            cursor: pointer;
            background: transparent;
            color: #d7d7d7;
            transition: background 0.2s, border-color 0.2s, color 0.2s;
            opacity: 0.6;
        }
        .nyat-group-tab + .nyat-group-tab {
            margin-left: 0;
        }
        .nyat-group-tab:hover {
            background: #303030;
            opacity: 1;
        }
        .nyat-group-tab.active {
            border-bottom-color: #7a7a7a;
            box-shadow: inset 0 -4px 0 #7a7a7a;
            opacity: 1;
        }
        .nyat-group-single .nyat-group-tab {
            box-shadow: none;
            cursor: default;
            opacity: 1;
        }
        .nyat-group-single .nyat-group-tab:hover {
            background: transparent;
        }
        .nyat-group-single .nyat-group-tab.active {
            border-bottom-color: transparent;
            box-shadow: none;
        }
        .nyat-light .nyat-group-tabbar {
            border-bottom-color: #c8c8c8;
            background: #f4f4f4;
        }
        .nyat-light .nyat-group-tab {
            color: #444;
        }
        .nyat-light .nyat-group-tab:hover {
            background: #e9e9e9;
        }
        .nyat-light .nyat-group-tab.active {
            color: #222;
            border-bottom-color: #7a7a7a;
        }
        .nyat-group-actions {
            display: none;
            align-items: center;
            gap: 8px;
            flex: 0 0 auto;
            flex-wrap: nowrap;
            margin-top: 0;
            padding: 0;
        }
        .nyat-group-actions .panel-title { display: none; }
        .nyat-group-actions .nyat-panel-left {
            flex-grow: 1;
            gap: 8px;
        }
        .nyat-group-actions .nyat-panel-left > * {
            margin-left: 8px !important;
        }
        .nyat-group-content > .panel {
            margin-bottom: 0;
            border: none;
            border-radius: 0;
            box-shadow: none;
        }
        .nyat-group-content { margin-top: 0; }
        .nyat-group-content.panel-body { padding: 0; }
    `;
    document.head.appendChild(s);

    if (document.body) {
        subscribeToThemeChange(() => {
            const isDark = isDarkMode();
            document.body.classList.toggle('nyat-dark', isDark);
            document.body.classList.toggle('nyat-light', !isDark);
        });
    }
})()

function fetchUrl(url, timeout = 10000) {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            headers: {
                "Accept": "application/json"
            },
            method: "GET",
            url,
            timeout,
            ontimeout: function () {
                reject(new Error(`Request timed out after ${timeout}ms`));
            },
            onerror: function (err) {
                reject(err ? err : new Error('Failed to fetch'))
            },
            onload: function (response) {
                // console.log('onload', response)
                try {
                    resolve(JSON.parse(response.responseText));
                } catch (err) {
                    resolve(response.responseText);
                }
            }
        })
    });
}

function fetchUrlRaw(url, timeout = 10000) {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: "GET",
            url,
            timeout,
            redirect: "follow",
            responseType: "arraybuffer",
            ontimeout: () => reject(new Error(`Timed out after ${timeout}ms`)),
            onerror: (err) => reject(err || new Error('Failed to fetch')),
            onload: (response) => {
                if (response.status < 200 || response.status >= 300) {
                    reject(new Error(`HTTP ${response.status}: ${url}`));
                    return;
                }
                resolve(response);
            }
        });
    });
}

function isDarkMode() {
    return localStorage.getItem("theme") === "dark";
}

function subscribeToThemeChange(callback) {
    callback();
    const observer = new MutationObserver(() => {
        callback();
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('storage', (e) => {
        if (e.key === 'theme') {
            callback();
        }
    });
}

function makePanelCollapsible(panel, startCollapsed = false) {
    const heading = panel.querySelector('.panel-heading');
    if (!heading) return;

    heading.classList.add('nyat-panel-heading');

    // Add collapse/expand icon if it doesn't exist
    if (!heading.querySelector('i.fa-chevron-down')) {
        const title = heading.querySelector('.panel-title');
        if (title) title.classList.add('nyat-panel-title');

        const icon = document.createElement("i");
        icon.className = "fa-solid fa-chevron-down nyat-chevron";
        heading.appendChild(icon);
    }

    const body = panel.querySelector('.panel-body');
    if (!body) return;

    let isCollapsed = startCollapsed;
    // Helper to set visibility of buttons/selects in heading (skip always-visible controls)
    function setHeaderControlsVisibility(visible) {
        const controls = heading.querySelectorAll('button, select');
        controls.forEach(ctrl => {
            if (ctrl.dataset.alwaysVisible) return;
            ctrl.style.visibility = visible ? 'visible' : 'hidden';
        });
    }
    if (startCollapsed) {
        body.style.display = "none";
        const icon = heading.querySelector('i.fa-chevron-down');
        if (icon) {
            icon.style.transform = "rotate(-90deg)";
        }
        setHeaderControlsVisibility(false);
    } else {
        setHeaderControlsVisibility(true);
    }

    heading.addEventListener("click", (e) => {
        // Don't collapse if clicking the filter button or tab controls
        if (e.target.closest('.btn')) return;
        if (e.target.closest('[data-no-collapse]')) return;

        isCollapsed = !isCollapsed;
        body.style.display = isCollapsed ? "none" : "block";
        const icon = heading.querySelector('i.fa-chevron-down');
        if (icon) {
            icon.style.transform = isCollapsed ? "rotate(-90deg)" : "rotate(0deg)";
        }
        setHeaderControlsVisibility(!isCollapsed);
    });
}

function makeDescriptionPanelCollapsible(panelFooter, startCollapsed = false) {
    if (!panelFooter) return;

    const descriptionElement = document.querySelector('#torrent-description');
    if (!descriptionElement) return;

    const descriptionPanel = descriptionElement.closest('.panel');
    if (!descriptionPanel) return;

    // Check if icon already exists
    if (panelFooter.querySelector('i[data-description-collapse]')) return;

    // Create chevron icon
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-chevron-down pull-right nyat-chevron';
    icon.style.cssText = 'cursor: pointer; vertical-align: middle; line-height: inherit; margin-left: 20px;';
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('data-description-collapse', 'true');

    let isCollapsed = startCollapsed;
    if (startCollapsed) {
        descriptionPanel.style.display = 'none';
        icon.style.transform = 'rotate(-90deg)';
    }

    // Toggle function
    icon.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();

        isCollapsed = !isCollapsed;

        // Toggle panel visibility
        if (isCollapsed) {
            descriptionPanel.style.display = 'none';
            icon.style.transform = 'rotate(-90deg)';
        } else {
            descriptionPanel.style.display = '';
            icon.style.transform = 'rotate(0deg)';
        }
    });

    // Insert icon on the right side of the panel-footer (rightmost position)
    // Find existing pull-right elements
    const pullRightElements = Array.from(panelFooter.querySelectorAll('.pull-right'));

    if (pullRightElements.length > 0) {
        // Insert before the first pull-right element so it appears as the rightmost element
        // (with pull-right, first in DOM = rightmost visually)
        pullRightElements[0].parentNode.insertBefore(icon, pullRightElements[0]);
    } else {
        // If no pull-right elements, append to the end (it will still be on the right due to pull-right class)
        panelFooter.appendChild(icon);
    }
}

function extractSubtitlesFromHtml(html) {
    try {
        // Parse the HTML using DOMParser
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        const subtitles = [];
        // Regex to locate the Subtitles section
        const subtitlesRegex = /<th.*?>Extractions<\/th>.*?Subtitles:(.*?)<\/td>/s;
        const alternativeRegex = /Subtitles<\/th>.*?<td>(.*?)<\/td>/s;
        let match = html.match(subtitlesRegex);
        if (!match) {
            match = html.match(alternativeRegex);
        }

        if (match && match[1]) {
            const subtitlesHtml = match[1];

            // Extract all links and their text
            const linksRegex = /<a href="([^"]+)">([^<]+)<\/a>/g;
            let linkMatch;
            while ((linkMatch = linksRegex.exec(subtitlesHtml)) !== null) {
                subtitles.push({
                    text: parser.parseFromString(linkMatch[2].trim(), "text/html").documentElement.textContent,
                    link: linkMatch[1].trim(),
                });
            }
        }

        return subtitles;
    } catch (error) {
        console.error("Error parsing subtitles:", error);
        return [];
    }
}

function extractScreenshotsFromHtml(html) {
    try {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const screenshots = [];

        doc.querySelectorAll("a.screenthumb").forEach(a => {
            const href = a.getAttribute("href");
            if (!href) return;
            const img = a.querySelector("img");
            const src = img?.getAttribute("src") || href;

            // Convert sframes URLs for animetosho.org, pass through direct URLs (e.g. i.kek.sh)
            const storageUrl = href.includes('/sframes/')
                ? href.replace(/.*\/sframes\//, 'https://storage.animetosho.org/sframes/').replace(/&amp;/g, '&')
                : href;
            const thumbnailUrl = src.includes('/sframes/')
                ? src.replace(/.*\/sframes\//, 'https://storage.animetosho.org/sframes/').replace(/&amp;/g, '&')
                : src;

            const trackMatch = href.match(/s=(\d+)/);
            const trackFlag = trackMatch ? `s=${trackMatch[1]}` : 's=1';

            screenshots.push({
                url: storageUrl,
                thumbnail: thumbnailUrl,
                title: a.getAttribute("title") || img?.getAttribute("alt") || "",
                track: trackFlag
            });
        });

        return screenshots;
    } catch (error) {
        console.error("Error parsing screenshots:", error);
        return [];
    }
}

function extractFileinfoFromHtml(html) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        let el = doc.getElementById('file_addinfo'); // AnimeTosho.org
        if (!el) {
            el = doc.getElementById('additional_info_text'); // AnimeTosho.xyz
        }
        let raw = el.innerHTML.replace(/<br\s*\/?>/gi, '\n');
        // Decode HTML entities (including &nbsp;)
        const txt = document.createElement('textarea');
        txt.innerHTML = raw;
        raw = txt.value;
        return raw.trim();
    } catch (error) {
        console.error("Error extracting fileinfo from HTML:", error);
        return '';
    }
}

function parseToshoXyzSearch(input, method = 'html') {
    try {
        if (method === 'api') {
            const item = input?.data?.[0];
            if (!item) return null;

            let viewId = item.id ? String(item.id) : null;
            let viewUrl = item.urls?.view || '';
            if (!viewId && viewUrl) {
                const match = viewUrl.match(/\/view\/(\d+)/);
                viewId = match ? match[1] : null;
            }
            if (!viewUrl && viewId) {
                viewUrl = `https://animetosho.xyz/view/${viewId}`;
            }

            const seriesId = item.series?.anidb_aid ? String(item.series.anidb_aid) : null;

            let nzbUrl = '';
            const mirrors = Array.isArray(item.ddl_mirrors) ? item.ddl_mirrors : [];
            const nzbMirror = mirrors.find(m => (m.label || '').toUpperCase() === 'NZB');
            nzbUrl = nzbMirror?.url || '';

            return { viewId, viewUrl, seriesId, nzbUrl };
        }

        if (typeof input !== 'string') return null;
        const doc = new DOMParser().parseFromString(input, "text/html");
        const entry = doc.querySelector('.home_list_entry');
        if (!entry) return null;

        const viewAnchor = entry.querySelector('.link a[href^="/view/"]');
        const viewHref = viewAnchor?.getAttribute('href') || '';
        const viewIdMatch = viewHref.match(/\/view\/(\d+)/);
        const viewId = viewIdMatch ? viewIdMatch[1] : null;
        const viewUrl = viewHref ? new URL(viewHref, 'https://animetosho.xyz').toString() : '';

        const seriesAnchor = entry.querySelector('.links .serieslink a[href^="/series/"]');
        const seriesHref = seriesAnchor?.getAttribute('href') || '';
        const seriesIdMatch = seriesHref.match(/\/series\/(\d+)/);
        const seriesId = seriesIdMatch ? seriesIdMatch[1] : null;

        let nzbUrl = '';
        const nzbAnchor = [...entry.querySelectorAll('.links a')]
            .find(a => (a.textContent || '').trim().toLowerCase() === 'nzb');
        if (nzbAnchor) {
            const href = nzbAnchor.getAttribute('href') || '';
            nzbUrl = href ? new URL(href, 'https://animetosho.xyz').toString() : '';
        }

        return { viewId, viewUrl, seriesId, nzbUrl };
    } catch (error) {
        console.error("Error parsing AnimeTosho.xyz search data:", error);
        return null;
    }
}

function extractAnimeToshoXyzFileMeta(html) {
    try {
        const doc = new DOMParser().parseFromString(html, "text/html");

        // Current layout: <th>File Name (Size)</th> then link in adjacent <td>
        const fileNameRow = [...doc.querySelectorAll('tr')]
            .find(row => (row.querySelector('th')?.textContent || '').trim().startsWith('File Name'));
        const rowAnchor = fileNameRow?.querySelector('td a[href]');
        if (rowAnchor) {
            return {
                filename: (rowAnchor.textContent || '').trim(),
                fileInfoLink: rowAnchor.getAttribute('href') || '',
            };
        }

        // Fallback for older page layout.
        const legacyAnchor = doc.querySelector('a.filemeta_name');
        if (legacyAnchor) {
            return {
                filename: (legacyAnchor.textContent || '').trim(),
                fileInfoLink: legacyAnchor.getAttribute('href') || '',
            };
        }
    } catch (error) {
        console.error('Error extracting AnimeTosho.xyz file metadata:', error);
    }

    return { filename: '', fileInfoLink: '' };
}

async function fetchTsukihimeFileMediainfo(torrentId, fileId, torrentFile) {
    if (torrentFile?.mediainfo) return torrentFile.mediainfo;
    if (!torrentId || !fileId) return '';

    try {
        const response = await fetchUrl(`https://api.tsukihime.org/v1/torrents/${torrentId}/file/${fileId}`);
        return response?.mediainfo || response?.info?.mediainfo || '';
    } catch (error) {
        console.error('Error fetching Tsukihime mediainfo:', error);
        return '';
    }
}

function parseSubtitleTracksFromFileinfo(fileinfoText) {
    // Returns array of {id, forced, default, language, title}
    const tracks = [];
    if (!fileinfoText) return tracks;
    // Split into lines
    const lines = fileinfoText.split(/\r?\n/);
    let current = null;
    for (let line of lines) {
        // Start of a new subtitle track
        const m = line.match(/^Text #(\d+)/);
        if (m) {
            if (current) tracks.push(current);
            current = { id: null, forced: false, default: false, language: '', title: '' };
            continue;
        }
        if (!current) continue;
        // Parse properties
        const idMatch = line.match(/^ID[\s:]+(\d+)/i);
        if (idMatch) current.id = idMatch[1];
        if (/^Forced\s*:\s*Yes/i.test(line)) current.forced = true;
        if (/^Forced\s*:\s*No/i.test(line)) current.forced = false;
        if (/^Default\s*:\s*Yes/i.test(line)) current.default = true;
        if (/^Default\s*:\s*No/i.test(line)) current.default = false;
        const lang = line.match(/^Language\s*:\s*(.*)$/i);
        if (lang) current.language = lang[1].trim();
        const title = line.match(/^Title\s*:\s*(.*)$/i);
        if (title) current.title = title[1].trim();
    }
    if (current) tracks.push(current);

    // Only return tracks with a valid id
    return tracks.filter(t => t.id !== null);
}

function getImageUrl(url, trackNum) {
    let imgUrlObj = new URL(url);
    try {
        if (trackNum) {
            imgUrlObj.searchParams.set('s', trackNum);
        } else {
            imgUrlObj.searchParams.delete('s');
        }
    } catch (error) {
        console.log(error);
    }
    return imgUrlObj.toString();
}

function openScreenshotModal(screenshots, initialIndex, trackNum, episodeTitle, trackName) {
    // Remove existing modal if any
    const existingModal = document.getElementById('screenshot-modal');
    if (existingModal) {
        existingModal.remove();
    }

    let currentIndex = initialIndex;

    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'screenshot-modal';

    // Lock scroll position
    const originalScrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${originalScrollY}px`;
    document.body.style.width = '100%';

    const modalContent = document.createElement('div');
    modalContent.className = 'nyat-modal-content';

    const topBar = document.createElement('div');
    topBar.className = 'nyat-modal-topbar';

    const titleElement = document.createElement('div');
    titleElement.className = 'nyat-modal-title';

    const episodeTitleElement = document.createElement('div');
    episodeTitleElement.className = 'nyat-modal-ep-title';

    const screenshotTitle = document.createElement('div');
    screenshotTitle.className = 'nyat-modal-screenshot-title';

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'nyat-modal-btns';

    const openButton = document.createElement('button');
    openButton.className = 'nyat-modal-btn';
    openButton.innerHTML = '<i class="fa-solid fa-external-link-alt"></i>';
    openButton.title = 'Open in new tab';

    const closeButton = document.createElement('button');
    closeButton.className = 'nyat-modal-btn';
    closeButton.innerHTML = '<i class="fa-solid fa-times"></i>';
    closeButton.title = 'Close';

    // Create navigation arrows (fixed to screen)
    let leftArrow, rightArrow;
    if (screenshots.length > 1) {
        leftArrow = document.createElement('button');
        leftArrow.className = 'nyat-modal-arrow nyat-modal-arrow-left';
        leftArrow.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
        leftArrow.title = 'Previous image';

        rightArrow = document.createElement('button');
        rightArrow.className = 'nyat-modal-arrow nyat-modal-arrow-right';
        rightArrow.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
        rightArrow.title = 'Next image';
    }

    const imageContainer = document.createElement('div');
    imageContainer.className = 'nyat-modal-image-wrap';

    const modalImage = document.createElement('img');

    // Image preloading cache
    const imageCache = new Map();

    // Create bottom bar with dot indicators (fixed to screen)
    let bottomBar;
    if (screenshots.length > 1) {
        bottomBar = document.createElement('div');
        bottomBar.className = 'nyat-modal-dots';

        const dotsContainer = document.createElement('div');
        dotsContainer.className = 'nyat-dots-inner';

        // Add click handler to the dots container
        dotsContainer.addEventListener('click', (e) => {
            e.stopPropagation();

            // Get all dots
            const dots = dotsContainer.querySelectorAll('button');
            if (!dots.length) return;

            // Get click position relative to the container
            const rect = dotsContainer.getBoundingClientRect();
            const clickX = e.clientX - rect.left;

            // Find the closest dot
            let closestDot = null;
            let minDistance = Infinity;

            dots.forEach((dot, index) => {
                const dotRect = dot.getBoundingClientRect();
                const dotCenter = dotRect.left + dotRect.width / 2 - rect.left;
                const distance = Math.abs(clickX - dotCenter);

                if (distance < minDistance) {
                    minDistance = distance;
                    closestDot = index;
                }
            });

            // Update to the closest dot
            if (closestDot !== null) {
                currentIndex = closestDot;
                updateModal();
            }
        });

        bottomBar.appendChild(dotsContainer);
    }

    // Function to preload an image
    function preloadImage(url) {
        if (imageCache.has(url)) {
            return Promise.resolve(imageCache.get(url));
        }

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                imageCache.set(url, img);
                resolve(img);
            };
            img.onerror = reject;
            img.src = url;
        });
    }

    // Function to update the modal content
    function updateModal() {
        const screenshot = screenshots[currentIndex];
        const fullUrl = getImageUrl(screenshot.url, trackNum);

        // Update titles
        episodeTitleElement.textContent = episodeTitle;
        screenshotTitle.textContent = `${screenshot.title} | ${trackName}`;

        // Update open button click handler
        openButton.onclick = (e) => {
            e.stopPropagation();
            window.open(fullUrl, '_blank');
        };

        // Clear previous image
        modalImage.src = '';

        // Show new image immediately with high priority
        modalImage.fetchpriority = 'high';
        modalImage.src = fullUrl;
        modalImage.style.opacity = '1';

        // Only start preloading after current image is fully loaded
        modalImage.onload = () => {
            // Preload adjacent images in background
            const prevIndex = currentIndex === 0 ? screenshots.length - 1 : currentIndex - 1;
            const nextIndex = currentIndex === screenshots.length - 1 ? 0 : currentIndex + 1;

            if (screenshots.length > 1) {
                const prevUrl = getImageUrl(screenshots[prevIndex].url, trackNum);
                const nextUrl = getImageUrl(screenshots[nextIndex].url, trackNum);

                // Preload silently
                preloadImage(prevUrl).catch(() => { });
                preloadImage(nextUrl).catch(() => { });
            }
        };

        // Update dots if they exist
        if (bottomBar && screenshots.length > 1) {
            const dotsContainer = bottomBar.querySelector('.nyat-dots-inner');
            dotsContainer.innerHTML = '';
            screenshots.forEach((_, index) => {
                const dot = document.createElement('button');
                dot.className = 'nyat-dot' + (index === currentIndex ? ' active' : '');
                dot.onclick = (e) => {
                    e.stopPropagation();
                    currentIndex = index;
                    updateModal();
                };
                dotsContainer.appendChild(dot);
            });
        }

    }


    // Event listeners
    closeButton.onclick = (e) => {
        e.stopPropagation();
        modalOverlay.remove();
    };

    // Close on overlay click, but not on the image or dot indicators
    modalOverlay.addEventListener('click', (e) => {
        // Check if the click was on a button, dot indicators, or other interactive element
        const isInteractive = e.target.closest('button') ||
            e.target === modalImage ||
            e.target.closest('#screenshot-modal > div:last-child') ||
            e.target.closest('select');

        // Close if not clicking on an interactive element
        if (!isInteractive) {
            modalOverlay.remove();
        }
    });

    // Prevent modal content clicks from closing modal only for specific elements
    modalContent.addEventListener('click', (e) => {
        // Only prevent closing for these specific elements
        const shouldPreventClose = e.target === modalImage ||
            e.target.closest('button') ||
            e.target.closest('select');

        if (shouldPreventClose) {
            e.stopPropagation();
        }
    });

    // Add click handler to top bar
    topBar.addEventListener('click', (e) => {
        // Only prevent closing if clicking on buttons or select
        const isInteractive = e.target.closest('button') || e.target.closest('select');
        if (!isInteractive) {
            modalOverlay.remove();
        }
    });

    // Navigation with wrap-around
    if (leftArrow && rightArrow) {
        leftArrow.onclick = (e) => {
            e.stopPropagation();
            currentIndex = currentIndex === 0 ? screenshots.length - 1 : currentIndex - 1;
            updateModal();
        };

        rightArrow.onclick = (e) => {
            e.stopPropagation();
            currentIndex = currentIndex === screenshots.length - 1 ? 0 : currentIndex + 1;
            updateModal();
        };
    }

    // Keyboard navigation with wrap-around
    function handleKeydown(e) {
        if (document.getElementById('screenshot-modal')) {
            switch (e.key) {
                case 'Escape':
                    modalOverlay.remove();
                    break;
                case 'ArrowLeft':
                    currentIndex = currentIndex === 0 ? screenshots.length - 1 : currentIndex - 1;
                    updateModal();
                    break;
                case 'ArrowRight':
                    currentIndex = currentIndex === screenshots.length - 1 ? 0 : currentIndex + 1;
                    updateModal();
                    break;
            }
        }
    }
    document.addEventListener('keydown', handleKeydown);

    // Remove keydown listener and restore scroll when modal is closed
    const originalRemove = modalOverlay.remove;
    modalOverlay.remove = function () {
        document.removeEventListener('keydown', handleKeydown);
        // Restore scroll position
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        window.scrollTo(0, originalScrollY);
        originalRemove.call(this);
    };

    // Assemble the modal
    buttonContainer.appendChild(openButton);
    buttonContainer.appendChild(closeButton);
    titleElement.appendChild(episodeTitleElement);
    titleElement.appendChild(screenshotTitle);
    topBar.appendChild(titleElement);
    topBar.appendChild(buttonContainer);

    imageContainer.appendChild(modalImage);

    modalContent.appendChild(imageContainer);

    if (leftArrow) modalOverlay.appendChild(leftArrow);
    if (rightArrow) modalOverlay.appendChild(rightArrow);
    if (bottomBar) modalOverlay.appendChild(bottomBar);

    modalOverlay.appendChild(modalContent);
    modalOverlay.appendChild(topBar);

    // Initialize modal content
    updateModal();

    // Add to page
    document.body.appendChild(modalOverlay);
}

function addScreenshotsToPage(screenshots, fileInfo, subtitles, episodeTitle, info_source) {
    if (!screenshots.length || settings.screenshots === "no") return;
    let refreshPanel = false;
    let wasCollapsed = false;
    let savedTrackSelection = null;
    const existingPanel = document.getElementById('nyat-screenshots-panel');
    if (existingPanel) {
        const trackSelector = existingPanel.querySelector('select');
        if (trackSelector) {
            savedTrackSelection = trackSelector.value;
        }
        const body = existingPanel.querySelector('.panel-body');
        if (body && body.style.display === 'none') {
            wasCollapsed = true;
        }
        existingPanel.remove();
        refreshPanel = true;
    }

    // Create screenshots panel
    const screenshotsPanel = document.createElement("div");
    screenshotsPanel.id = "nyat-screenshots-panel";
    screenshotsPanel.className = "panel panel-default";

    const heading = document.createElement("div");
    heading.className = "panel-heading nyat-panel-heading nyat-panel-heading";

    const leftSection = document.createElement("div");
    leftSection.className = "nyat-panel-left";

    const title = document.createElement("h3");
    title.className = "panel-title nyat-panel-title";
    title.textContent = "Screenshots";

    // Create track selector
    const trackSelector = document.createElement("select");
    trackSelector.className = "nyat-track-selector";
    trackSelector.dataset.alwaysVisible = 'true';

    // Function to update track selector style
    function updateTrackSelectorStyle() {
        if (isDarkMode()) {
            trackSelector.style.backgroundColor = "#6e757c";
            trackSelector.style.color = "#fff";
            trackSelector.style.border = "1px solid #636a70";
        } else {
            trackSelector.style.backgroundColor = "#fff";
            trackSelector.style.color = "#333";
            trackSelector.style.border = "1px solid #ccc";
        }
    }
    // Subscribe to theme changes for the track selector
    subscribeToThemeChange(updateTrackSelectorStyle);

    // Add "No Track" option
    const noTrackOption = document.createElement("option");
    noTrackOption.value = "";
    noTrackOption.textContent = "No Subtitle Track";
    trackSelector.appendChild(noTrackOption);

    // Create a container for the screenshots grid
    const gridContainer = document.createElement("div");
    gridContainer.style.display = "grid";
    // Set grid template columns based on screenshotRows setting
    let columnsPerRow;
    switch (settings.previewSize) {
        case "compact": info_source == "AnimeTosho.xyz" ? columnsPerRow = "4" : columnsPerRow = "5"; break;
        case "medium": columnsPerRow = "3"; break;
        case "large": columnsPerRow = "2"; break;
        case "huge": columnsPerRow = "1"; break;
        default: columnsPerRow = "3";
    }
    gridContainer.style.gridTemplateColumns = `repeat(${columnsPerRow}, 1fr)`;
    gridContainer.style.gap = "10px";
    gridContainer.style.width = "100%";

    // Inject responsive grid CSS once per settings value
    const gridStyleId = `nyat-grid-${settings.previewSize}`;
    if (!document.getElementById(gridStyleId)) {
        const col1200 = settings.previewSize === "compact" ? "5" : settings.previewSize === "medium" ? "3" : settings.previewSize === "large" ? "2" : "1";
        const col600 = settings.previewSize === "compact" ? "3" : settings.previewSize === "medium" ? "2" : "1";
        const gs = document.createElement("style");
        gs.id = gridStyleId;
        gs.textContent = `
            @media (max-width: 1200px) { .screenshot-grid { grid-template-columns: repeat(${col1200}, 1fr) !important; } }
            @media (max-width: 600px)  { .screenshot-grid { grid-template-columns: repeat(${col600},  1fr) !important; } }
        `;
        document.head.appendChild(gs);
    }

    gridContainer.classList.add("screenshot-grid");

    function updateScreenshots(trackNum) {
        // Clear existing screenshots
        gridContainer.innerHTML = '';

        // Try to extract aspect ratio from fileInfo
        let aspectRatio = 9 / 16; // default
        if (fileInfo) {
            const match = fileInfo.match(/Display aspect ratio\s*:\s*(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)/);
            if (match) {
                const w = parseFloat(match[1]);
                const h = parseFloat(match[2]);
                if (w > 0 && h > 0) {
                    aspectRatio = h / w;
                }
            }
        }

        screenshots.forEach(({ url, thumbnail, title }) => {
            const imgContainer = document.createElement("div");
            imgContainer.className = "nyat-screenshot-thumb";
            imgContainer.style.paddingBottom = `${aspectRatio * 100}%`;

            const titleOverlay = document.createElement("div");
            titleOverlay.className = "nyat-screenshot-overlay";
            titleOverlay.textContent = title;

            const img = document.createElement("img");
            if (info_source != "AnimeTosho.xyz") {
                img.src = getImageUrl(url.replace('.png', '.jpg'), trackNum);
            } else {
                img.src = getImageUrl(url, trackNum);
            }
            img.onload = () => {
                imgContainer.style.paddingBottom = `${img.naturalHeight / img.naturalWidth * 100}%`;
            };

            imgContainer.appendChild(img);
            imgContainer.appendChild(titleOverlay);
            gridContainer.appendChild(imgContainer);

            imgContainer.addEventListener("click", (e) => {
                e.preventDefault();
                const currentIndex = screenshots.findIndex(s => s.title === title);
                const currentTrackName = trackSelector.options[trackSelector.selectedIndex].text;
                openScreenshotModal(screenshots, currentIndex, trackNum, episodeTitle, currentTrackName);
            });
        });
    }

    // Add track options from subtitles (not available for AnimeTosho.xyz source)
    if (subtitles && info_source !== "AnimeTosho.xyz") {
        subtitles.forEach(({ text, link }) => {
            const trackMatch = link.match(/_track(\d+)/);
            if (trackMatch && !text.includes("All Attachments")) {
                const trackNum = trackMatch[1];
                const option = document.createElement("option");
                option.value = trackNum;
                option.textContent = `Track ${trackNum} - ${text}`;
                trackSelector.appendChild(option);
            }
        });
    }
    if (info_source === "AnimeTosho.xyz") {
        trackSelector.style.display = "none";
    }

    // Set initial track selection based on screenshotSubs setting
    let initialTrackIndex = 0;

    // If refreshing and we have a saved track selection, use it
    if (refreshPanel && savedTrackSelection !== null) {
        for (let i = 0; i < trackSelector.options.length; i++) {
            if (trackSelector.options[i].value === savedTrackSelection) {
                initialTrackIndex = i;
                break;
            }
        }
    } else if (settings.subsByDefault === "first-nonforced") {
        if (fileInfo) {
            const tracks = parseSubtitleTracksFromFileinfo(fileInfo);
            // console.log(fileInfo)
            // console.log(tracks)
            const nonForced = tracks.find(t => !t.forced);
            if (nonForced) {
                // Find the option in trackSelector that matches this id
                for (let i = 0; i < trackSelector.options.length; i++) {
                    if (trackSelector.options[i].text.includes(`Track ${nonForced.id}`)) {
                        initialTrackIndex = i;
                        break;
                    }
                }
            } else if (trackSelector.options.length > 1) {
                initialTrackIndex = 1; // fallback to first track
            }
        } else if (trackSelector.options.length > 1) {
            initialTrackIndex = 1;
        }
    } else if (settings.subsByDefault === "first" && trackSelector.options.length > 1) {
        initialTrackIndex = 1;
    }
    trackSelector.selectedIndex = initialTrackIndex;
    updateScreenshots(trackSelector.value);

    // Add change handler for track selector
    trackSelector.addEventListener("change", (e) => {
        e.stopPropagation();
        updateScreenshots(e.target.value);
    });

    // Prevent clicks on the track selector from triggering panel collapse
    trackSelector.addEventListener("click", (e) => {
        e.stopPropagation();
    });

    leftSection.appendChild(title);
    leftSection.appendChild(trackSelector);
    heading.appendChild(leftSection);

    const icon = document.createElement("i");
    icon.className = "fa-solid fa-chevron-down nyat-chevron";
    heading.appendChild(icon);

    screenshotsPanel.appendChild(heading);

    // Create panel body with screenshots
    const body = document.createElement("div");
    body.className = "panel-body";
    body.style.padding = "15px";

    body.appendChild(gridContainer);
    screenshotsPanel.appendChild(body);

    // Make the panel collapsible, start collapsed if setting is "hide"
    if (refreshPanel) {
        makePanelCollapsible(screenshotsPanel, wasCollapsed);
    } else {
        makePanelCollapsible(screenshotsPanel, settings.screenshots === "hide");
    }
    // Insert after description panel (reorderPanels will sort final order)
    const descPanel = document.querySelector("#torrent-description")?.closest(".panel.panel-default");
    if (descPanel) {
        descPanel.parentNode.insertBefore(screenshotsPanel, descPanel.nextSibling);
    }
}

function openFileinfoTab(fileInfo, selectedEpFilename, e) {
    if (e) e.preventDefault();
    const fileTitle = (selectedEpFilename || 'Fileinfo').replace(/</g, '&lt;');
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${fileTitle}</title>
    <style>
        body { background-color: #121212; color: #ffffff; font-family: Arial, sans-serif; padding: 0; margin: 0; }
        pre { white-space: pre-wrap; word-wrap: break-word; padding: 20px; margin: 0; font-size: 13px; border: 0; }
    </style>
</head>
<body><pre>${fileInfo.replace(/</g, '&lt;')}</pre></body>
</html>`;
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const isMiddleClick = e && e.button === 1;
    const isCtrlClick = e && (e.ctrlKey || e.metaKey);
    const shouldOpenWithoutFocus = isMiddleClick || isCtrlClick;
    const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
    if (shouldOpenWithoutFocus) {
        if (isFirefox) {
            window.open(url, '_blank', 'noopener,noreferrer');
        } else {
            const win = window.open(url, '_blank', 'noopener,noreferrer');
            if (win) {
                try { win.blur(); } catch { }
                try { window.focus(); } catch { }
                setTimeout(() => { try { win.blur(); } catch { } try { window.focus(); } catch { } }, 0);
            }
        }
    } else {
        window.open(url, '_blank');
    }
}

function addFileinfoFooterItem(fileInfo, selectedEpFilename, parent, magnet) {
    if (!fileInfo || !parent || !magnet) return;
    const existingWrap = parent.querySelector('.nyat-fileinfo-wrap');
    if (existingWrap) existingWrap.remove();
    const existingItem = parent.querySelector('a.nyat-fileinfo-item');
    if (existingItem) {
        const prevNode = existingItem.previousSibling;
        if (prevNode && prevNode.nodeType === Node.TEXT_NODE && prevNode.textContent.trim() === 'or') {
            prevNode.remove();
        }
        existingItem.remove();
    }
    const fileTitle = (selectedEpFilename || 'FileInfo').replace(/</g, '&lt;');
    const wrapper = document.createElement('span');
    wrapper.className = 'nyat-fileinfo-wrap';
    wrapper.appendChild(document.createTextNode(' or '));
    const item = magnet.cloneNode(true);
    item.className = (item.className || '') + ' nyat-fileinfo-item';
    item.innerHTML = '<i class="fa fa-file fa-fw"></i>FileInfo';
    item.href = '#';
    item.onclick = function (e) {
        e.preventDefault();
        openFileinfoTab(fileInfo, fileTitle, e);
        return false;
    };
    wrapper.appendChild(item);
    parent.appendChild(wrapper);
}

function addFileinfoFeatures(fileInfo, selectedEpFilename, parent, magnet) {
    const mode = settings.fileinfoMode;
    if (mode === 'panel' || mode === 'both') {
        addFileinfoToPage(fileInfo, selectedEpFilename);
    }
    if (mode === 'item' || mode === 'both') {
        addFileinfoFooterItem(fileInfo, selectedEpFilename, parent, magnet);
    }
}

function addFileinfoToPage(fileInfo, selectedEpFilename) {
    if (!fileInfo) return null;

    // Preserve collapsed state and height from previous panel instance
    let startCollapsed = settings.fileinfoPanel === "hide";
    let savedHeight = null;
    const existing = document.getElementById('nyat-fileinfo-panel');
    if (existing) {
        const existingBody = existing.querySelector('.panel-body');
        const existingPre = existing.querySelector('pre');
        startCollapsed = existingBody?.style.display === 'none';
        if (existingPre) savedHeight = existingPre.style.maxHeight || null;
        existing.remove();
    }

    const panel = document.createElement('div');
    panel.id = 'nyat-fileinfo-panel';
    panel.className = 'panel panel-default';

    const heading = document.createElement('div');
    heading.className = 'panel-heading nyat-panel-heading nyat-panel-heading-fixed';

    const title = document.createElement('h3');
    title.className = 'panel-title nyat-panel-title';
    title.textContent = 'FileInfo';

    const openBtn = document.createElement('button');
    openBtn.className = 'btn btn-xs';
    openBtn.style.cssText = 'margin-left: 10px; padding: 2px 6px; font-size: 12px; cursor: pointer; position: relative; z-index: 1; flex-shrink: 0;';
    openBtn.innerHTML = 'Open in new tab <i class="fa-solid fa-external-link-alt" style="margin-left: 2px;"></i>';
    openBtn.title = 'Open in new tab';
    openBtn.dataset.alwaysVisible = 'true';

    let openBtnHovered = false;
    function updateOpenBtnStyle() {
        const normal = { bg: isDarkMode() ? "#6c757d" : "#fff", border: isDarkMode() ? "#636a70" : "#ccc", color: isDarkMode() ? "#fff" : "#333" };
        const hover = { bg: isDarkMode() ? "#5a6268" : "#f2f2f2", border: isDarkMode() ? "#545b62" : "#bbb", color: isDarkMode() ? "#fff" : "#333" };
        const c = openBtnHovered ? hover : normal;
        openBtn.style.backgroundColor = c.bg;
        openBtn.style.borderColor = c.border;
        openBtn.style.color = c.color;
    }
    openBtn.addEventListener('mouseenter', () => { openBtnHovered = true; updateOpenBtnStyle(); });
    openBtn.addEventListener('mouseleave', () => { openBtnHovered = false; updateOpenBtnStyle(); });
    subscribeToThemeChange(updateOpenBtnStyle);

    openBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openFileinfoTab(fileInfo, selectedEpFilename, e);
    });
    openBtn.addEventListener('auxclick', (e) => {
        if (e.button === 1) { e.preventDefault(); e.stopPropagation(); openFileinfoTab(fileInfo, selectedEpFilename, e); }
    });

    const leftSection = document.createElement('div');
    leftSection.className = 'nyat-panel-left';
    leftSection.appendChild(title);
    leftSection.appendChild(openBtn);
    heading.appendChild(leftSection);

    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-chevron-down nyat-chevron';
    heading.appendChild(icon);

    panel.appendChild(heading);

    // Body
    const body = document.createElement('div');
    body.className = 'panel-body';
    body.style.cssText = 'padding: 0; overflow: hidden; border-bottom-left-radius: inherit; border-bottom-right-radius: inherit;';

    const pre = document.createElement('pre');
    pre.className = 'nyat-pre';
    pre.style.maxHeight = savedHeight || `${settings.fileinfoHeight || 420}px`;
    pre.textContent = fileInfo;

    function updatePreStyle() {
        if (isDarkMode()) {
            pre.style.backgroundColor = "#323232";
            pre.style.color = "#afafaf";
        } else {
            pre.style.backgroundColor = "#fff";
            pre.style.color = "#333";
        }
    }
    subscribeToThemeChange(updatePreStyle);

    body.appendChild(pre);

    const dragHandle = document.createElement('div');
    dragHandle.className = 'nyat-drag-handle';
    dragHandle.title = 'Drag to resize';

    const dragGrip = document.createElement('div');
    dragGrip.className = 'nyat-drag-grip';

    function updateDragHandleStyle() {
        dragGrip.style.backgroundColor = isDarkMode() ? '#fff' : '#333';
    }
    subscribeToThemeChange(updateDragHandleStyle);
    dragHandle.appendChild(dragGrip);
    body.appendChild(dragHandle);

    let dragStartY = 0;
    let dragStartHeight = 0;
    const minHeight = 80;
    const maxHeight = 1000;
    const scrollThreshold = 40;
    const scrollStep = 5;

    dragHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragStartY = e.pageY;
        dragStartHeight = pre.getBoundingClientRect().height;

        function onMouseMove(e) {
            const delta = e.pageY - dragStartY;
            const newHeight = Math.min(maxHeight, Math.max(minHeight, dragStartHeight + delta));
            pre.style.maxHeight = newHeight + 'px';

            const viewportHeight = window.innerHeight;
            if (e.clientY > viewportHeight - scrollThreshold) {
                const maxScrollY = document.documentElement.scrollHeight - viewportHeight;
                if (window.scrollY < maxScrollY) {
                    window.scrollBy(0, scrollStep);
                }
            } else if (e.clientY < scrollThreshold) {
                if (window.scrollY > 0) {
                    window.scrollBy(0, -scrollStep);
                }
            }
        }

        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    panel.appendChild(body);

    makePanelCollapsible(panel, startCollapsed);

    // Insert after description panel (reorderPanels will sort final order)
    const descriptionPanel = document.querySelector('#torrent-description')?.closest('.panel');
    if (descriptionPanel) {
        descriptionPanel.parentNode.insertBefore(panel, descriptionPanel.nextSibling);
    }

    return panel;
}

async function getValidHighlighterStyle(styleName) {
    const url = `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/${styleName}.css`;
    try {
        const resp = await fetch(url, { method: 'HEAD' });
        if (resp.ok) return styleName;
    } catch { }
    return 'atom-one-dark';
}

function getFileNameFromUrl(url) {
    try {
        const u = new URL(url);
        let name = u.pathname.split('/').pop() || 'subtitle.xz';
        // If Content-Disposition is present in query, use it
        const cd = u.searchParams.get('response-content-disposition');
        if (cd) {
            const match = cd.match(/filename\*=UTF-8''([^;]+)/);
            if (match) {
                name = decodeURIComponent(match[1]);
            }
        }
        // Decode any percent-encoded characters (e.g. %5B, %5D)
        name = decodeURIComponent(name);
        return name;
    } catch {
        return 'subtitle.xz';
    }
}

function xzStripSha256(arrayBuffer) {
    // For xz decompression with SHA-256 integrity checks (on tsukihime) as xz-decompress does not supoort it
    function writeVarInt(value) {
        const bytes = [];
        do { let b = value & 0x7F; value >>>= 7; if (value) b |= 0x80; bytes.push(b); } while (value);
        return bytes;
    }
    function readVarInt(src, p) {
        let val = 0, shift = 0, byte;
        do { byte = src[p++]; val |= (byte & 0x7F) << shift; shift += 7; } while (byte & 0x80);
        return { value: val, pos: p };
    }
    function crc32xz(data) {
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < data.length; i++) {
            crc ^= data[i];
            for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }
    const src = new Uint8Array(arrayBuffer);
    const dv = new DataView(arrayBuffer);
    const n = src.length;

    if ((src[7] & 0x0F) !== 0x0A) return arrayBuffer; // not SHA-256, pass through

    const SHA256_SIZE = 32;

    // Parse footer to find index
    const backwardSizeRaw = dv.getUint32(n - 8, true);
    const indexSize = (backwardSizeRaw + 1) * 4;
    const indexStart = n - 12 - indexSize;

    // Parse index
    let p = indexStart + 1; // skip indicator byte 0x00
    let r = readVarInt(src, p); const numRecords = r.value; p = r.pos;
    const records = [];
    for (let i = 0; i < numRecords; i++) {
        r = readVarInt(src, p); const unpaddedSize = r.value; p = r.pos;
        r = readVarInt(src, p); const uncompressedSize = r.value; p = r.pos;
        records.push({ unpaddedSize, uncompressedSize });
    }

    const out = [];

    // Patched stream header (check type → None)
    const newHeader = src.slice(0, 12);
    newHeader[7] = 0x00;
    new DataView(newHeader.buffer).setUint32(8, crc32xz(newHeader.slice(6, 8)), true);
    out.push(newHeader);

    // Blocks: strip 32-byte SHA-256 check from each
    let blockStart = 12;
    const newRecords = [];
    for (const { unpaddedSize, uncompressedSize } of records) {
        const blockHeaderSize = (src[blockStart] + 1) * 4;
        const compressedSize = unpaddedSize - blockHeaderSize - SHA256_SIZE;
        const newUnpaddedSize = unpaddedSize - SHA256_SIZE;
        const oldPaddedSize = Math.ceil(unpaddedSize / 4) * 4;
        // SHA256_SIZE is divisible by 4 so padding amount is unchanged
        const padLen = oldPaddedSize - SHA256_SIZE - newUnpaddedSize;

        out.push(src.slice(blockStart, blockStart + blockHeaderSize + compressedSize));
        if (padLen > 0) out.push(new Uint8Array(padLen));

        blockStart += oldPaddedSize;
        newRecords.push({ unpaddedSize: newUnpaddedSize, uncompressedSize });
    }

    // Rebuild index
    const idxParts = [0x00, ...writeVarInt(numRecords)];
    for (const { unpaddedSize, uncompressedSize } of newRecords) {
        idxParts.push(...writeVarInt(unpaddedSize), ...writeVarInt(uncompressedSize));
    }
    while (idxParts.length % 4 !== 0) idxParts.push(0x00);
    const idxData = new Uint8Array(idxParts);
    const newIndex = new Uint8Array(idxData.length + 4);
    newIndex.set(idxData);
    new DataView(newIndex.buffer).setUint32(idxData.length, crc32xz(idxData), true);
    out.push(newIndex);

    // Rebuild footer
    const newFooter = new Uint8Array(12);
    const fdv = new DataView(newFooter.buffer);
    fdv.setUint32(4, (newIndex.length / 4) - 1, true); // new backward size
    newFooter[8] = 0x00; newFooter[9] = 0x00;          // stream flags: None
    newFooter[10] = 0x59; newFooter[11] = 0x5A;        // footer magic YZ
    fdv.setUint32(0, crc32xz(newFooter.slice(4, 10)), true);
    out.push(newFooter);

    // Concatenate
    const total = out.reduce((s, p) => s + p.length, 0);
    const result = new Uint8Array(total);
    let off = 0;
    for (const p of out) { result.set(p, off); off += p.length; }
    return result.buffer;
}

function addSubtitlesToTorrentList(subtitles, isFilteredInit, selectedEpFilename) {
    let refreshPanel = false;
    let wasCollapsed = false;
    const existingPanel = document.getElementById('nyat-attachments-panel');
    if (existingPanel) {
        const body = existingPanel.querySelector('.panel-body');
        if (body && body.style.display === 'none') {
            wasCollapsed = true;
        }
        existingPanel.remove();
        refreshPanel = true;
    }

    const fileListPanel = document.querySelector(".panel.panel-default > .torrent-file-list.panel-body");
    if (!fileListPanel) {
        console.error("File list panel-body element not found.");
        return;
    }
    const panel = fileListPanel.closest(".panel.panel-default");
    if (!panel) {
        console.error("Parent panel element not found.");
        return;
    }
    const attachmentsPanel = document.createElement("div");
    attachmentsPanel.id = "nyat-attachments-panel";
    attachmentsPanel.className = "panel panel-default";
    const heading = document.createElement("div");
    heading.className = "panel-heading nyat-panel-heading";

    const leftSection = document.createElement("div");
    leftSection.className = "nyat-panel-left";

    const title = document.createElement("h3");
    title.className = "panel-title nyat-panel-title";
    title.textContent = "Attachments";

    // Use a local variable for filter state
    if (!refreshPanel) {
        window.isFiltered = isFilteredInit;
    }

    const toggleButton = document.createElement("button");
    toggleButton.textContent = window.isFiltered ? "Filter ON" : "Filter OFF";
    toggleButton.className = "btn btn-sm";
    toggleButton.style.marginLeft = "10px";
    toggleButton.style.padding = "2px 6px";
    toggleButton.style.fontSize = "12px";
    toggleButton.style.cursor = "pointer";
    toggleButton.style.position = "relative";
    toggleButton.style.zIndex = "1";

    // Track current state for hover effects
    let isHovered = false;

    // Function to apply colors to button
    function applyColors() {
        // Define color schemes dynamically so they always reflect the current theme
        const colorSchemes = {
            success: {
                normal: { bg: isDarkMode() ? "#74b666" : "#74b666", border: "#2bc14a", color: "#fff" },
                hover: { bg: "#28a745", border: "#1e7e34", color: "#fff" }
            },
            secondary: {
                normal: { bg: isDarkMode() ? "#6c757d" : "#fff", border: isDarkMode() ? "#636a70" : "#ccc", color: isDarkMode() ? "#fff" : "#333" },
                hover: { bg: isDarkMode() ? "#5a6268" : "#f2f2f2", border: isDarkMode() ? "#545b62" : "#bbb", color: isDarkMode() ? "#fff" : "#333" }
            }
        };
        const scheme = window.isFiltered ? colorSchemes.success : colorSchemes.secondary;
        const colors = isHovered ? scheme.hover : scheme.normal;
        toggleButton.style.color = colors.color;
        toggleButton.style.backgroundColor = colors.bg;
        toggleButton.style.borderColor = colors.border;
    }

    // Function to update button appearance
    function updateButtonStyle() {
        applyColors();
    }

    // Add hover event listeners (only once)
    toggleButton.addEventListener("mouseenter", () => {
        isHovered = true;
        applyColors();
    });

    toggleButton.addEventListener("mouseleave", () => {
        isHovered = false;
        applyColors();
    });

    updateButtonStyle();

    // Subscribe to theme changes for the filter button
    subscribeToThemeChange(updateButtonStyle);

    // Body container for subtitle links
    const body = document.createElement("div");
    body.className = "panel-body";

    // Function to update the filtered subtitles list display
    function updateFilter() {
        toggleButton.textContent = window.isFiltered ? "Filter ON" : "Filter OFF";
        updateButtonStyle();
        const filteredSubtitles = window.isFiltered
            ? subtitles.filter(subtitle =>
                settings.languageFilters.some(filter =>
                    subtitle.text.includes(`${filter} [`)
                    || subtitle.text.includes(`[${filter},`)
                    || subtitle.text.includes(`[${filter}-`)
                    || new RegExp(`\\b${filter}-[^\\s\\]]+ \\[`).test(subtitle.text)
                    || subtitle.text.includes("All Attachments")
                )
            )
            : subtitles;
        body.innerHTML = "";
        filteredSubtitles.forEach(({ text, link }, index) => {
            const anchor = document.createElement("a");
            anchor.href = link;
            anchor.textContent = text;
            anchor.target = "_blank";

            // Custom action for subtitle attachments if actionByDefault is 'view' and not 'All Attachments'
            async function onViewClick(e) {
                // const isAssFile = /\.ass(\.xz)?$/i.test(link);
                // const isSrtFile = /\.srt(\.xz)?$/i.test(link);
                // const isPgsFile = /\.sup(\.xz)?$/i.test(link);
                const isAssFile = /ASS]?$/i.test(text);
                const isSrtFile = /SRT]?$/i.test(text);
                const isPgsFile = /PGS]?$/i.test(text);
                const isHighlightableFile = isAssFile || isSrtFile;

                // Detect if this is a middle click or ctrl+click (open in new tab without focus)
                const isMiddleClick = e.button === 1;
                const isCtrlClick = e.ctrlKey || e.metaKey;
                const shouldOpenWithoutFocus = isMiddleClick || isCtrlClick;

                // try {
                // Fetch the subtitle file as an arraybuffer via GM (bypasses CORS)
                let start_time = Date.now();
                const response = await fetchUrlRaw(link);
                console.log(`Fetch time for subtitle: ${Date.now() - start_time}ms`);
                const download_url = response.finalUrl || response.responseURL;
                // console.log(download_url)
                const arrayBuffer = response.response;
                const patchedBuffer = xzStripSha256(arrayBuffer);
                const XzReadableStream = window['xz-decompress']?.XzReadableStream;
                const decompressedStream = new XzReadableStream(new Response(patchedBuffer).body);
                const decompressedText = await new Response(decompressedStream).text();

                // if (!XzReadableStream) throw new Error('XZ decompressor not found');
                // const decompressedStream = new XzReadableStream(new Response(arrayBuffer).body, { memoryLimit: 128 * 1024 * 1024 });
                // const decompressedText = await new Response(decompressedStream).text();
                // Encode original arraybuffer as base64 to embed directly in the HTML
                console.log(`Decompressed subtitle in ${Date.now() - start_time}ms`);
                const bytes = new Uint8Array(arrayBuffer);
                let binary = '';

                const chunkSize = 0x8000; // 32KB

                for (let i = 0; i < bytes.length; i += chunkSize) {
                    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
                }

                const originalBase64 = btoa(binary);
                console.log(`Encoded original subtitle in base64 in ${Date.now() - start_time}ms`);
                // Get the filename from the URL
                const fileName = getFileNameFromUrl(download_url).replace(/</g, '&lt;');
                // console.log(fileName)
                // Open in new tab
                const htmlContent = `
                            <!DOCTYPE html>
                            <html>
                            <head>
                                <meta charset='utf-8'>
                                <title>${fileName.replace(/\.xz$/i, '')} - ${text.replace(/</g, '&lt;')}</title>
                                <style>
                                    body {
                                        background-color: #121212;
                                        color: #ffffff;
                                        font-family: Arial, sans-serif;
                                        padding: 0px;
                                        margin-top: 0 !important;
                                    }
                                    .button-bar {
                                        display: flex;
                                        gap: 10px;
                                        margin: 18px 0 18px 0;
                                        justify-content: flex-start;
                                        margin-bottom: 8px;
                                    }
                                    .nyat-btn {
                                        background: #232323;
                                        color: #fff;
                                        border: 1px solid #555;
                                        border-radius: 6px;
                                        padding: 7px 10px;
                                        font-size: 15px;
                                        cursor: pointer;
                                        transition: background 0.2s, border 0.2s;
                                        margin-bottom: 8px;
                                    }
                                    .nyat-btn:hover {
                                        background: #333;
                                        border: 1px solid #4CAF50;
                                        color: #b0ffb0;
                                    }
                                    .nyat-title-bar {
                                        position: sticky;
                                        top: 0;
                                        margin: 0 0 0 0;
                                        padding: 0 0 0 0;
                                        border-bottom: 1px solid #333;
                                    }
                                    .nyat-filename {
                                        font-size: 16px;
                                        color: #ffffff;
                                        font-weight: 700;
                                        margin-left: 12px;
                                        margin-bottom: 2px;
                                        white-space: nowrap;
                                        overflow: hidden;
                                        text-overflow: ellipsis;
                                        max-width: 100%;
                                    }
                                    .nyat-tracktitle {
                                        font-size: 14px;
                                        color: #fff;
                                        font-weight: 400;
                                        opacity: 0.6;
                                        margin-left: 12px;
                                        margin-bottom: 8px;
                                        white-space: nowrap;
                                        overflow: hidden;
                                        text-overflow: ellipsis;
                                        max-width: 100%;
                                    }
                                    pre {
                                        white-space: pre;
                                        overflow-x: auto;
                                        overflow-y: auto;
                                        padding: 1em;
                                        background: #232323;
                                    }
                                    pre > code.hljs {
                                        margin: -1em !important;
                                    }
                                </style>
                                ${isHighlightableFile ? `
                                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/${settings.highlighterStyle}.css">
                                <script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/highlight.min.js"></script>
                                ${isAssFile ? `<script src="https://cdn.jsdelivr.net/npm/highlightjs-ass@1/dist/ass.min.js"></script>` : ''}
                                ${isSrtFile ? `
                                <script>
                                // Custom SRT syntax highlighting
                                (function() {
                                    hljs.registerLanguage('srt', function(hljs) {
                                        return {
                                            name: 'srt',
                                            case_insensitive: false,
                                            contains: [
                                                { // Line info
                                                    begin: [/^\\d+\\n/,
                                                            /^\\d{2}:\\d{2}:\\d{2},\\d{3}/,
                                                            /\\s*-->\\s*/,
                                                            /\\d{2}:\\d{2}:\\d{2},\\d{3}/],
                                                    scope: { 1: 'built_in', // Line number
                                                            2: 'literal', // Start time
                                                            3: 'comment', // -->
                                                            4: 'title.class' }, // End time
                                                },
                                                { // Tags like <i> <u> <b>
                                                    begin: [/</,
                                                            /\\/?(i|b|u)/,
                                                            />/],
                                                    scope: { 1: 'comment', // Open bracket <
                                                            2: 'title.function.invoke', // Tag name
                                                            3: 'comment' }, // Close bracket >
                                                },
                                                { // Font tags like <font color="red"> or <font color="#FF0000">
                                                    begin: [/</,
                                                            /font/,
                                                            /\\s+color\\s*=\\s*["']/,
                                                            /[^"']+/,
                                                            /["']/,
                                                            />/],
                                                    scope: { 1: 'comment', // Open bracket <
                                                            2: 'title.function.invoke', // Tag name
                                                            3: 'title.function.invoke', // color=
                                                            4: 'string', // Color value
                                                            5: 'title.function.invoke', // Closing quote
                                                            6: 'comment' }, // Close bracket >
                                                },
                                                { // Tags like {\an8}
                                                    begin: ['{',
                                                            /\\\\(a|an)/,
                                                            /\\d+/,
                                                            '}'],
                                                    scope: { 1: 'comment', // Open bracket {
                                                            2: 'title.function.invoke', // Tag name
                                                            3: 'params', // Tag parameter number
                                                            4: 'comment' }, // Close bracket }
                                                },
                                            ]
                                        };
                                    });
                                })();
                                </script>

                                ` : ''}
                                ` : ''}
                            </head>
                            <body>
                                <div style="display: flex; align-items: center; gap: 12px; width: 100%; border-bottom: 1px solid #333; padding-top: 8px; padding-bottom: 0px; position: sticky; top: 0; background: #121212; z-index: 10;">
                                    <div style="display: flex; flex-direction: column; flex: 1 1 0; min-width: 0;">
                                        <div class="nyat-filename" id="nyat-filename"></div>
                                        <div class="nyat-tracktitle">${text.replace(/</g, '&lt;')} | Size: ${decompressedText.length.toLocaleString()} characters</div>
                                    </div>
                                    <div class="button-bar" style="margin:0; flex-shrink: 0; display: flex; gap: 8px;">
                                        ${isHighlightableFile ? `<button class="nyat-btn" id="toggle-highlight">Highlighting: OFF</button>` : ''}
                                        <button class="nyat-btn" id="download-xz">Download</button>
                                        <button class="nyat-btn" id="download-extracted">Download Extracted</button>
                                        <input type="hidden" id="nyat-original-link" value="">
                                    </div>
                                </div>
                                ${isPgsFile ? `<pre>No preview available for PGS files</pre>` :
                        isHighlightableFile ? `<pre><code class="${isAssFile ? 'language-ass' : 'language-srt'}">${decompressedText.replace(/</g, '&lt;')}</code></pre>` : `<pre>${decompressedText.replace(/</g, '&lt;')}</pre>`}
                                <script>
                                (function() {
                                    const fileName = '${fileName.replace(/'/g, "\\'")}';
                                    const originalBase64 = '${originalBase64}';
                                    const displayName = fileName.replace(/\.xz$/i, '') || 'subtitle';
                                    document.getElementById('nyat-filename').textContent = displayName;
                                })();
                                // Download original .xz file
                                document.getElementById('download-xz').onclick = async function() {
                                    const fileName = '${fileName.replace(/'/g, "\\'")}';
                                    const originalBase64 = '${originalBase64}';
                                    const bytes = Uint8Array.from(atob(originalBase64), c => c.charCodeAt(0));
                                    const blob = new Blob([bytes]);
                                    const a = document.createElement('a');
                                    a.href = URL.createObjectURL(blob);
                                    a.download = '${fileName.replace(/'/g, "\\'")}' || 'subtitle.xz';
                                    document.body.appendChild(a);
                                    a.click();
                                    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
                                    document.body.removeChild(a);
                                };
                                // Download extracted subtitle
                                document.getElementById('download-extracted').onclick = function() {
                                    let baseName = ('${fileName.replace(/'/g, "\\'")}' || 'subtitle').replace(/\.xz$/i, '');
                                    if (!baseName) baseName = 'subtitle';
                                    const blob = new Blob([document.querySelector('pre').innerText], {type: 'text/plain'});
                                    const a = document.createElement('a');
                                    a.href = URL.createObjectURL(blob);
                                    a.download = baseName;
                                    document.body.appendChild(a);
                                    a.click();
                                    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
                                    document.body.removeChild(a);
                                };
                                // Highlight subtitle files if needed
                                ${isHighlightableFile ? `
                                (function() {
                                    let highlighted = false;
                                    const btn = document.getElementById('toggle-highlight');
                                    const code = document.querySelector('code');
                                    if (btn && code) {
                                        const plainText = code.textContent;
                                        // console.log('Subtitle plainText length:', plainText.length.toLocaleString());
                                        let highlightedHtml = null;
                                        // Highlight by default if the subtitle is small enough
                                        if (plainText.length <= ${settings.highlighterCharCap}) {
                                            window.hljs.highlightElement(code);
                                            highlightedHtml = code.innerHTML;
                                            btn.textContent = 'Highlight: ON';
                                            highlighted = true;
                                        }
                                        btn.onclick = function() {
                                            if (!highlighted) {
                                                if (plainText.length > ${settings.highlighterCharCap} && !highlightedHtml) {
                                                    if (!confirm('This file is large (' + plainText.length.toLocaleString() + ' characters) and highlighting may be slow or freeze your browser. Proceed anyway?')) {
                                                        return;
                                                    }
                                                }
                                                if (!highlightedHtml) {
                                                    window.hljs.highlightElement(code);
                                                    highlightedHtml = code.innerHTML;
                                                } else {
                                                    code.innerHTML = highlightedHtml;
                                                }
                                                code.classList.add('hljs');
                                                btn.textContent = 'Highlight: ON';
                                                highlighted = true;
                                            } else {
                                                code.classList.remove('hljs');
                                                code.textContent = plainText;
                                                btn.textContent = 'Highlight: OFF';
                                                highlighted = false;
                                            }
                                        };
                                    }
                                })();
                                ` : ''}
                                </script>
                            </body>
                            </html>
                        `;
                // Pass the original link and blob to the new tab for download
                const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                if (shouldOpenWithoutFocus) {
                    const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
                    if (isFirefox) {
                        let win = window.open(url, '_blank', 'noopener,noreferrer');
                    } else {
                        try {
                            GM_openInTab(url, { active: false });
                        } catch (err) { }
                    }

                } else {
                    window.open(url, '_blank');
                }
                // } catch (err) {
                //     alert('Failed to view subtitle: ' + err.message);
                // }
            }
            if (settings.attachmentAction === 'view' && !text.includes('All Attachments')) {
                anchor.addEventListener('click', async function (e) {
                    e.preventDefault();
                    onViewClick(e);

                });
                // Support middle-click via auxclick to open without focusing
                anchor.addEventListener('auxclick', async function (e) {
                    if (e.button !== 1) return; // only handle middle-click
                    e.preventDefault();
                    onViewClick(e);
                });
            } else if (settings.attachmentAction === 'download extracted' && !text.includes('All Attachments')) {
                anchor.addEventListener('click', async function (e) {
                    e.preventDefault();
                    try {
                        const response = await fetchUrlRaw(link);
                        const download_url = response.finalUrl || response.responseURL;
                        // console.log(download_url)
                        const arrayBuffer = response.response;
                        const XzReadableStream = window['xz-decompress']?.XzReadableStream;
                        if (!XzReadableStream) throw new Error('XZ decompressor not found');
                        const decompressedStream = new XzReadableStream(new Response(arrayBuffer).body);
                        const decompressedResponse = new Response(decompressedStream);
                        // Get the decompressed text
                        const decompressedText = await decompressedResponse.text();
                        // Download extracted subtitle
                        let baseName = (function () {
                            try {
                                const u = new URL(download_url);
                                let name = u.pathname.split('/').pop() || 'subtitle.xz';
                                // If Content-Disposition is present in query, use it
                                const cd = u.searchParams.get('response-content-disposition');
                                if (cd) {
                                    const match = cd.match(/filename\*=UTF-8''([^;]+)/);
                                    if (match) {
                                        name = decodeURIComponent(match[1]);
                                    }
                                }
                                // Decode any percent-encoded characters (e.g. %5B, %5D)
                                name = decodeURIComponent(name);
                                return name.replace(/\.xz$/i, '');
                            } catch {
                                return 'subtitle';
                            }
                        })();
                        const blob = new Blob([decompressedText], { type: 'text/plain' });
                        const a = document.createElement('a');
                        a.href = URL.createObjectURL(blob);
                        a.download = baseName;
                        document.body.appendChild(a);
                        a.click();
                        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
                        document.body.removeChild(a);
                    } catch (err) {
                        alert('Failed to download extracted subtitle: ' + err.message);
                    }
                });
            }
            body.appendChild(anchor);
            if (index < filteredSubtitles.length - 1) {
                if (index < subtitles.length - 1) {
                    if (text.includes("All Attachments")) {
                        body.appendChild(document.createTextNode(" | "));
                    } else {
                        body.appendChild(document.createTextNode(", "));
                    }
                }
            }
        });
    }

    toggleButton.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent the click from bubbling up to the header
        window.isFiltered = !window.isFiltered;
        updateFilter();
    });

    // Add title and button to the left section
    leftSection.appendChild(title);
    leftSection.appendChild(toggleButton);

    heading.appendChild(leftSection);

    const icon = document.createElement("i");
    icon.className = "fa-solid fa-chevron-down nyat-chevron";
    heading.appendChild(icon);

    attachmentsPanel.appendChild(heading);
    attachmentsPanel.appendChild(body);

    // Insert after description panel (reorderPanels will sort final order)
    const descPanel = document.querySelector('#torrent-description')?.closest('.panel');
    if (descPanel) {
        descPanel.parentNode.insertBefore(attachmentsPanel, descPanel.nextSibling);
    } else {
        panel.parentNode.insertBefore(attachmentsPanel, panel);
    }

    // Make attachments panel collapsible
    if (refreshPanel) {
        makePanelCollapsible(attachmentsPanel, wasCollapsed);
    } else {
        makePanelCollapsible(attachmentsPanel, settings.attachments === "hide");
    }

    // **Call updateFilter once here to respect filtersByDefault on initial load**
    updateFilter();
}

function formatTimestamp(ms) {
    const totalSeconds = Math.floor(ms / 1000);

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${hours.toString().padStart(2, "0")}:` +
        `${minutes.toString().padStart(2, "0")}:` +
        `${seconds.toString().padStart(2, "0")}`;
}

async function doFeatures() {
    const TOSHO_XYZ_METHOD = 'api'; // 'html' uses hash search, 'api' uses title search
    let startTime = performance.now();
    const magnet = document.querySelector("div > a.card-footer-item");

    const parent = magnet?.parentElement;
    if (!settings.descriptionHeader || settings.description === 'no') {
        makeDescriptionPanelCollapsible(parent, settings.description === 'no');
    }

    // Apply description panel settings
    const descPanel = document.querySelector('#torrent-description')?.closest('.panel');
    if (descPanel) {
        if (settings.description === "no") {
            descPanel.style.display = "none";
        } else if (settings.descriptionHeader) {
            // Inject a proper heading if one doesn't exist yet
            if (!descPanel.querySelector('.panel-heading')) {
                const descHeading = document.createElement('div');
                descHeading.className = 'panel-heading nyat-panel-heading';
                const descTitle = document.createElement('h3');
                descTitle.className = 'panel-title nyat-panel-title';
                descTitle.textContent = 'Description';
                descHeading.appendChild(descTitle);
                descPanel.insertBefore(descHeading, descPanel.firstChild);
            }
            makePanelCollapsible(descPanel, settings.description === "hide");
        } else {
            // No header — use the footer chevron approach, just set collapsed state
            if (settings.description === "hide") {
                const body = descPanel.querySelector('.panel-body');
                if (body) body.style.display = "none";
            }
        }
    }

    // Make the file list panel collapsible
    const fileListPanel = document.querySelector(".panel.panel-default > .torrent-file-list.panel-body");
    if (fileListPanel) {
        const panel = fileListPanel.closest(".panel.panel-default");
        if (panel) {
            makePanelCollapsible(panel);
        }
    }

    // Reorder static panels immediately (filelist, description, comments are already in DOM)
    reorderPanels();

    const hash = document.querySelector("body > div.container div.panel-body div.col-md-5 > kbd")?.textContent;
    const title = document.querySelector(".panel .panel-title").textContent.trim();
    const timestamp = document.querySelector("[data-timestamp]").dataset.timestamp;
    const isAnimeEnglishTranslated = !!document.querySelector('.panel-body a[href="/?c=1_2"]');
    if (!isAnimeEnglishTranslated) {
        // console.log("Not Anime English Translated, skipping...");
        // return;
    }
    // console.log(title)

    let info_source = "";

    let tosho = null;
    let tosho_xyz = null;
    let tsukihime = null;
    if (timestamp < 1778284800) { // 2026-05-09 when Animetosho.org stopped updating
        console.log(`Fetching tosho: ${performance.now() - startTime}ms`);
        tosho = await fetchUrl(`https://feed.animetosho.org/json?show=torrent&btih=${hash}`);
        console.log(`Fetched tosho: ${performance.now() - startTime}ms`);
        // Sort files by filename if they exist
        if (tosho.files) {
            tosho.files.sort((a, b) => a.filename.localeCompare(b.filename));
        }
        info_source = "AnimeTosho";
        console.log(tosho)
    } else {
        console.log(`Fetching tsukihime: ${performance.now() - startTime}ms`);
        tsukihime = await fetchUrl(`https://api.tsukihime.org/v1/torrents/btih/${hash}`)
        console.log(tsukihime)

        if (tsukihime?.state) {
            info_source = "TsukiHime";
        } else {
            console.log(`Fetching tosho_xyz: ${performance.now() - startTime}ms`);
            if (TOSHO_XYZ_METHOD === 'api') {
                // const title_url_encoded = encodeURIComponent(title);
                // const tosho_xyz_json = await fetchUrl(`https://feed.animetosho.xyz/json/v1/search?q=${title_url_encoded}&limit=1`);
                const tosho_xyz_json = await fetchUrl(`https://feed.animetosho.xyz/json/v1/search?q=${hash}&limit=1`);
                tosho_xyz = parseToshoXyzSearch(tosho_xyz_json, 'api');
                console.log(tosho_xyz)
            } else {
                const tosho_xyz_html = await fetchUrl(`https://animetosho.xyz/search?q=${hash}`);
                tosho_xyz = parseToshoXyzSearch(tosho_xyz_html, 'html');
            }

            console.log(`Fetched tosho_xyz: ${performance.now() - startTime}ms`);
            info_source = "AnimeTosho.xyz";
            if (!tosho_xyz || !tosho_xyz.viewId) {
                console.log("No AnimeTosho.xyz results found, skipping...");
                return;
            }
        }


    }


    let linkMap = null

    let toshoViewPageUrl = "";
    switch (info_source) {
        case "AnimeTosho":
            if (tosho.nyaa_id || tosho.anidex_id || tosho.tosho_id || tosho.nekobt_id) {
                toshoViewPageUrl = 'https://animetosho.org/view/';
                if (tosho.nyaa_id)
                    toshoViewPageUrl += `.n${tosho.nyaa_id}`;
                else if (tosho.anidex_id)
                    toshoViewPageUrl += `.d${tosho.anidex_id}`;
                else if (tosho.tosho_id)
                    toshoViewPageUrl += `${tosho.tosho_id}`;
                else if (tosho.nekobt_id)
                    toshoViewPageUrl += `.k${tosho.nekobt_id}`;
            }
            break;
        case "AnimeTosho.xyz":
            toshoViewPageUrl = tosho_xyz?.viewUrl || (tosho_xyz?.viewId ? `https://animetosho.xyz/view/${tosho_xyz.viewId}` : "");
            break;
        case "TsukiHime":
            toshoViewPageUrl = `https://tsukihime.org/view/${tsukihime.id}`
            break;
    }

    let selectedEpId = null;
    let selectedEpFilename = null; // Without folder name
    let countVidFiles = 0;
    const torrentFiles = info_source === "TsukiHime" ? tsukihime?.files : tosho?.files;
    switch (info_source) {
        case "AnimeTosho":
        case "TsukiHime":
            if (torrentFiles) {
                for (const file of torrentFiles) {
                    const filename = file.filename.toLowerCase();
                    if (!filename.endsWith(".mkv") && !filename.endsWith(".mp4") && !filename.endsWith(".ts")) continue;
                    if ((filename.startsWith("extra") || filename.startsWith("bonus") || filename.startsWith("special") || filename.startsWith("creditless")) && filename.includes("/")) continue;
                    if (!selectedEpId && !selectedEpFilename) {
                        selectedEpId = file.id;
                        selectedEpFilename = file.filename.split("/").pop();
                    }
                    countVidFiles++;
                }
            }
            break;
        case "AnimeTosho.xyz":
            selectedEpId = tosho_xyz?.viewId;
            break;
    }



    let anidb_aid = null;

    switch (info_source) {
        case "AnimeTosho":
            anidb_aid = tosho.anidb_aid;
            break;
        case "AnimeTosho.xyz":
            anidb_aid = tosho_xyz?.seriesId;
            break;
        case "TsukiHime":
            anidb_aid = tsukihime.anime.anidb;
            linkMap = {};
            linkMap.mal = `https://myanimelist.net/anime/${tsukihime.anime.mal}`;
            linkMap.anilist = `https://anilist.co/anime/${tsukihime.anime.anilist}`;
    }
    // console.log(anidb_aid)


    // Anidb
    if (anidb_aid && settings.anidb) {
        let text = document.createTextNode(" or ")
        parent?.appendChild(text)

        let anidbUrl = `https://anidb.net/anime/${anidb_aid}`;

        const anidb = magnet?.cloneNode(true);
        anidb.querySelector("i").remove()
        anidb.innerHTML = '<i class="fa-solid fa-database fa-fw"></i>AniDB'
        anidb.href = anidbUrl
        anidb.onclick = function () {
            window.open(anidbUrl, '_blank').focus();
            return false
        };
        parent?.appendChild(anidb);
    }

    // Function to fetch AniDB data from different APIs
    async function fetchAnidbLinkMap(anidbAid, anidbConnectingAPI) {
        let out_response = null;
        if (anidbConnectingAPI == 'plexanibridge') {
            out_response = await fetchUrl(`https://plexanibridge-api.elias.eu.org/api/v2/search?anidb_id=${anidbAid}`);
        } else if (anidbConnectingAPI == 'animeapi') {
            out_response = await fetchUrl(`https://animeapi.my.id/anidb/${anidbAid}`);
        }

        const linkMap = {};
        if (anidbConnectingAPI == 'plexanibridge') {
            try {
                const malId = out_response.results[0].mal_id;
                const malIdValue = Array.isArray(malId) ? malId[0] : malId;
                linkMap.mal = `https://myanimelist.net/anime/${malIdValue}`;
            }
            catch (error) {
                linkMap.mal = "https://myanimelist.net/anime/0";
            }
            try {
                const anilistId = out_response.results[0].anilist_id;
                const anilistIdValue = Array.isArray(anilistId) ? anilistId[0] : anilistId;
                linkMap.anilist = `https://anilist.co/anime/${anilistIdValue}`;
            }
            catch (error) {
                linkMap.anilist = "https://anilist.co/anime/0";
            }
        } else if (anidbConnectingAPI == 'animeapi') {
            linkMap.mal = `https://myanimelist.net/anime/${out_response.myanimelist}`;
            linkMap.anilist = `https://anilist.co/anime/${out_response.anilist}`;
        }

        return linkMap;
    }

    let anidbConnectingAPI = 'animeapi' // 'plexanibridge' or 'animeapi'

    // MyAnimeList
    const mal = magnet?.cloneNode(true);
    mal.href = `https://myanimelist.net/anime/0`
    if (anidb_aid && settings.myanimelist) {
        let text = document.createTextNode(" or ")
        parent?.appendChild(text)

        mal.querySelector("i").remove()
        mal.innerHTML = '<i class="fa-solid fa-database fa-fw"></i>MyAnimeList'

        async function openMal(e, linkMap, mal) {
            if (!linkMap) {
                linkMap = await fetchAnidbLinkMap(anidb_aid, anidbConnectingAPI);
                mal.href = linkMap.mal
            }
            if (linkMap.mal == "https://myanimelist.net/anime/0") {
                const anidbUrl = "https://anidb.net/anime/" + anidb_aid;
                if (window.confirm("No MyAnimeList link found for AniDB ID: " + anidb_aid + "\nOpen AniDB link instead?")) {
                    window.open(anidbUrl, '_blank');
                }
                return false;
            }
            e.preventDefault();
            const isMiddleClick = e.button === 1;
            const isCtrlClick = e.ctrlKey || e.metaKey;
            const openInBackground = isMiddleClick || isCtrlClick;
            const url = mal.href;
            if (openInBackground) {
                try { GM_openInTab(url, { active: false }); } catch (_) { window.open(url, '_blank'); }
            } else {
                window.open(url, '_blank').focus();
            }
            return false;
        }
        mal.onclick = async function (event) {
            event.preventDefault();
            return openMal(event, linkMap, mal);
        };
        mal.addEventListener('auxclick', async function (event) {
            if (event.button !== 1) return;
            event.preventDefault();
            return openMal(event, linkMap, mal);
        });
        parent?.appendChild(mal);
    }

    // Anilist
    const anilist = magnet?.cloneNode(true);
    anilist.href = `https://anilist.co/anime/0`
    if (anidb_aid && settings.anilist) {
        let text = document.createTextNode(" or ")
        parent?.appendChild(text)

        anilist.querySelector("i").remove()
        anilist.innerHTML = '<i class="fa-solid fa-database fa-fw"></i>AniList'

        async function openAnilist(e, linkMap, anilist) {
            if (!linkMap) {
                linkMap = await fetchAnidbLinkMap(anidb_aid, anidbConnectingAPI);
                anilist.href = linkMap.anilist
            }
            if (linkMap.anilist == "https://anilist.co/anime/0") {
                const anidbUrl = "https://anidb.net/anime/" + anidb_aid;
                if (window.confirm("No AniList link found for AniDB ID: " + anidb_aid + "\nOpen AniDB link instead?")) {
                    window.open(anidbUrl, '_blank');
                }
                return false;
            }
            e.preventDefault();
            const isMiddleClick = e.button === 1;
            const isCtrlClick = e.ctrlKey || e.metaKey;
            const openInBackground = isMiddleClick || isCtrlClick;
            const url = anilist.href;
            if (openInBackground) {
                try { GM_openInTab(url, { active: false }); } catch (_) { window.open(url, '_blank'); }
            } else {
                window.open(url, '_blank').focus();
            }
            return false;
        }
        anilist.onclick = async function (event) {
            event.preventDefault()

            return openAnilist(event, linkMap, anilist);
        };
        anilist.addEventListener('auxclick', async function (event) {
            if (event.button !== 1) return;
            event.preventDefault();
            return openAnilist(event, linkMap, anilist);
        });
        parent?.appendChild(anilist);
    }

    // Animetosho link
    if (toshoViewPageUrl && settings.animetosho) {
        let text = document.createTextNode(" or ")
        parent?.appendChild(text)

        const animetosho = magnet?.cloneNode(true);

        animetosho.querySelector("i").remove()
        if (info_source == "AnimeTosho.xyz" || info_source == "AnimeTosho") {
            if (tosho?.status == "skipped") {
                animetosho.innerHTML = `<i class="fa-solid fa-at fa-fw"></i>${info_source} (Skipped)`;
            } else if (tosho?.status == "processing") {
                animetosho.innerHTML = `<i class="fa-solid fa-at fa-fw"></i>${info_source} (Processing)`;
            } else {
                animetosho.innerHTML = `<i class="fa-solid fa-at fa-fw"></i>${info_source}`;
            }
        } else if (info_source == "TsukiHime") {
            if (tsukihime?.state == "skipped") {
                animetosho.innerHTML = '<i class="fa-solid fa-moon fa-fw"></i>TsukiHime (Skipped)';
            } else if (tsukihime?.state == "unprocessed") {
                animetosho.innerHTML = '<i class="fa-solid fa-moon fa-fw"></i>TsukiHime (Unprocessed)';
            } else if (tsukihime?.state == "processing") {
                animetosho.innerHTML = '<i class="fa-solid fa-moon fa-fw"></i>TsukiHime (Processing)';
            } else {
                animetosho.innerHTML = '<i class="fa-solid fa-moon fa-fw"></i>TsukiHime';
            }
        }
        animetosho.href = toshoViewPageUrl
        animetosho.onclick = function () {
            window.open(toshoViewPageUrl, '_blank').focus();
            return false
        };
        parent?.appendChild(animetosho);
    }

    // NZB
    nzb_url = null;
    switch (info_source) {
        case "AnimeTosho":
            nzb_url = tosho.nzb_url;
            break;
        case "AnimeTosho.xyz":
            nzb_url = tosho_xyz?.nzbUrl || null;
            break;
        case "TsukiHime":
            if (tsukihime.has_nzb == 1) {
                nzb_url = `https://storage.tsukihime.org/nzbs/${tsukihime.id}/${encodeURIComponent(title)}.nzb.gz`;
            }

    }
    if (nzb_url && settings.nzb) {
        let text = document.createTextNode(" or ")
        parent?.appendChild(text)

        if (settings.nzbKey) {
            const nzb_sab = magnet?.cloneNode(true);

            nzb_sab.querySelector("i").remove()
            //nzb_sab.innerHTML = '<svg id="Capa_1" width="16" height="16" style="vertical-align: -0.15em; margin-right: 2px" enable-background="new 0 0 512 512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><g><path d="m142.834 106.016v-106.016h-83.155v30h53.156v76.016h-68.156v405.984h422.643v-405.984zm171.679 375.984h-239.834v-345.984h239.834zm102.511-345.984-26.107 27.08-26.107-27.08zm-72.511 345.984v-323.813l46.404 48.133 46.404-48.133v323.813z" fill="#000000" style="fill: rgb(65, 125, 198);"></path><path d="m194.596 423.212c45.956 0 83.344-37.388 83.344-83.344 0-24.917-11.005-47.299-28.393-62.584 2.441-1.601 4.771-3.449 6.926-5.604 21.311-21.311 13.76-59.174 12.829-63.421l-2.057-9.383-9.383-2.058c-4.247-.93-42.111-8.482-63.422 12.83-13.685 13.685-15.464 34.185-14.741 48.236-38.869 7.047-68.446 41.114-68.446 81.984-.001 45.956 37.387 83.344 83.343 83.344zm21.057-192.351c5.334-5.334 16.46-6.401 25.567-5.964.438 9.113-.63 20.238-5.961 25.569-5.334 5.334-16.463 6.4-25.567 5.964-.439-9.113.63-20.238 5.961-25.569zm-21.057 55.663c29.414 0 53.344 23.93 53.344 53.344s-23.93 53.344-53.344 53.344-53.344-23.93-53.344-53.344 23.93-53.344 53.344-53.344z" fill="#000000" style="fill: rgb(65, 125, 198);"></path></g></svg>SabNZB'
            nzb_sab.innerHTML = '<i class="fa-solid fa-box fa-fw"></i>SabNZB'
            nzb_sab.onclick = function () {
                GM_xmlhttpRequest({
                    headers: {
                        "Accept": "application/json"
                    },
                    method: "GET",
                    url: `${settings.sabUrl}api?mode=addurl&name=${encodeURIComponent(nzb_url)}&apikey=${settings.nzbKey}`,
                    timeout: 5000
                })
                return false
            };
            nzb_sab.href = nzb_url
            parent?.appendChild(nzb_sab);

        } else {
            const nzb = magnet?.cloneNode(true);

            nzb.querySelector("i").remove()
            // Juice box svg but is inconsistent
            //nzb.innerHTML = '<svg id="Capa_1" width="16" height="16" style="vertical-align: -0.15em; margin-right: 2px" enable-background="new 0 0 512 512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><g><path d="m142.834 106.016v-106.016h-83.155v30h53.156v76.016h-68.156v405.984h422.643v-405.984zm171.679 375.984h-239.834v-345.984h239.834zm102.511-345.984-26.107 27.08-26.107-27.08zm-72.511 345.984v-323.813l46.404 48.133 46.404-48.133v323.813z" fill="#000000" style="fill: rgb(65, 125, 198);"></path><path d="m194.596 423.212c45.956 0 83.344-37.388 83.344-83.344 0-24.917-11.005-47.299-28.393-62.584 2.441-1.601 4.771-3.449 6.926-5.604 21.311-21.311 13.76-59.174 12.829-63.421l-2.057-9.383-9.383-2.058c-4.247-.93-42.111-8.482-63.422 12.83-13.685 13.685-15.464 34.185-14.741 48.236-38.869 7.047-68.446 41.114-68.446 81.984-.001 45.956 37.387 83.344 83.343 83.344zm21.057-192.351c5.334-5.334 16.46-6.401 25.567-5.964.438 9.113-.63 20.238-5.961 25.569-5.334 5.334-16.463 6.4-25.567 5.964-.439-9.113.63-20.238 5.961-25.569zm-21.057 55.663c29.414 0 53.344 23.93 53.344 53.344s-23.93 53.344-53.344 53.344-53.344-23.93-53.344-53.344 23.93-53.344 53.344-53.344z" fill="#000000" style="fill: rgb(65, 125, 198);"></path></g></svg>NZB'
            nzb.innerHTML = '<i class="fa-solid fa-box fa-fw"></i>NZB'
            nzb.href = nzb_url
            parent?.appendChild(nzb);
        }
    }

    // NekoBT
    if (settings.nekobt) {
        let nekobt_id = null;

        if (info_source === "TsukiHime") {
            nekobt_id = tsukihime.nekobt_id;
            injectLink();
        } else {
            GM_xmlhttpRequest({
                method: "GET",
                url: `https://nekobt.to/api/v1/torrents/search?query=${hash}`,

                onload: function (response) {
                    try {
                        const json = JSON.parse(response.responseText);
                        nekobt_id = json?.data?.infohash_match ?? null;
                    } catch (e) {
                        console.warn("NekoBT JSON parse failed:", e);
                    }
                    injectLink();
                },
                onerror: function (err) {
                    console.warn("NekoBT request failed:", err);
                }
            });
        }

        function injectLink() {
            if (!nekobt_id) return;
            const text = document.createTextNode(" or ");
            parent?.appendChild(text);
            const nekobt = magnet?.cloneNode(true);
            if (!nekobt) return;
            const icon = nekobt.querySelector("i");
            if (icon) icon.remove();
            nekobt.innerHTML = '<i class="fa-solid fa-cat fa-fw"></i>NekoBT';
            const nekobtUrl = `https://nekobt.to/torrents/${nekobt_id}`;
            nekobt.href = nekobtUrl;

            nekobt.onclick = function (e) {
                e.preventDefault();
                window.open(nekobtUrl, "_blank")?.focus();
            };
            parent?.appendChild(nekobt);
        }
    }

    if (countVidFiles > 1 && info_source !== "TsukiHime") {
        window.toshoHtml = await fetchUrl(toshoViewPageUrl);
    }

    async function doDynamicEpisodeFunctions(selectedEpId, selectedEpFilename_input, countVidFiles) {
        // For now selected Ep id is just the tosho id for xyz. Change later if batch support is added
        let selectedEpFilename = null;

        // Tsukihime
        let filenameNoPath = null;
        let currentText = null;
        let currentFile = null;

        switch (info_source) {
            case "AnimeTosho":
                selectedEpHtml = await fetchUrl(`https://animetosho.org/file/${selectedEpId}`);
                selectedEpFilename = selectedEpFilename_input;
                break;
            case "TsukiHime":
                selectedEpFilename = selectedEpFilename_input;
                for (file of tsukihime.files) {
                    filenameNoPath = file.filename.split("/").pop();
                    if (filenameNoPath === selectedEpFilename) {
                        currentFile = file;
                        break;
                    }
                }
                break;
            case "AnimeTosho.xyz":
                console.log(`Fetching selectedEpHtmlNoMediaInfo: ${performance.now() - startTime}ms`);
                selectedEpHtmlNoMediaInfo = await fetchUrl(`https://animetosho.xyz/view/${selectedEpId}`);
                console.log(`Fetched selectedEpHtmlNoMediaInfo: ${performance.now() - startTime}ms`);
                selectedEpHtml = selectedEpHtmlNoMediaInfo;
                const fileMeta = extractAnimeToshoXyzFileMeta(selectedEpHtml);
                selectedEpFilename = selectedEpFilename_input;
                break;
        }

        // Fileinfo
        let fileInfo = null;
        if (selectedEpId && info_source == "AnimeTosho") {
            fileInfo = await extractFileinfoFromHtml(selectedEpHtml);
            // console.log(fileInfo)
            if (fileInfo && settings.fileinfoMode !== "no") {
                addFileinfoFeatures(fileInfo, selectedEpFilename, parent, magnet);
            }
        }

        let subtitles = [];

        // Attachments
        if (selectedEpId && toshoViewPageUrl) {
            if (info_source == "AnimeTosho" || info_source == "AnimeTosho.xyz") {
                // Likely batch release so get the track attachments from first episode
                if (countVidFiles > 1) {
                    subtitles = extractSubtitlesFromHtml(window.toshoHtml);
                    // Check that it is a batch release
                    if (subtitles.length == 1 && subtitles[0].text == "All Attachments") {
                        subtitles[0].text = "All Attachments (Batch)";
                    }
                }

                // Get the track attachments from first episode
                // console.log(selectedEpHtml)
                const selectedEpSubtitles = extractSubtitlesFromHtml(selectedEpHtml);
                if (countVidFiles > 1) {
                    subtitles = [...subtitles, ...selectedEpSubtitles.slice(1)];
                } else {
                    subtitles = selectedEpSubtitles;
                }

                // console.log(subtitles)
                if (info_source == "AnimeTosho.xyz") {
                    for (const subtitle of subtitles) { // AnimeTosho.xyz subtitles are relative links
                        subtitle.link = `https://animetosho.xyz${subtitle.link}`;
                    }
                }
            }

            if (info_source == "TsukiHime") {
                // Batch
                if (countVidFiles > 1) {
                    subtitles.push({ "text": "All Attachments (Batch)", "link": `https://storage.tsukihime.org/torattachpack/${tsukihime.id}/${encodeURIComponent(tsukihime.name)}_attachments.7z` });
                } else {
                    subtitles.push({ "text": "All Attachments", "link": `https://storage.tsukihime.org/attachpack/${tsukihime.id}_${currentFile.id}/${filenameNoPath.replace(/\.[^/.]+$/, "")}_attachments.7z` });
                }

                for (const attachment of currentFile.attachments) {
                    // console.log(attachment)
                    if (attachment.type === 1) {
                        if (attachment.info.name === null) {
                            currentText = `${attachment.info.lang} [${attachment.info.codec}]`
                        } else {
                            currentText = `${attachment.info.name} [${attachment.info.lang}, ${attachment.info.codec}]`
                        }
                        subtitles.push({
                            "text": currentText,
                            "link": `https://storage.tsukihime.org/attach/${attachment.id.toString(16).padStart(8, '0').toUpperCase()}/${filenameNoPath.replace(/\.[^/.]+$/, "")}_track${attachment.info.tracknum}.${attachment.info.lang.toLowerCase()}.${attachment.info.codec.toLowerCase()}.xz`
                        });
                    }
                }
            }

            if (settings.attachments !== "no" && subtitles.length > 0) {
                addSubtitlesToTorrentList(subtitles, settings.filtersByDefault, selectedEpFilename);
            }
            reorderPanels();
        }

        // Screenshots
        if (toshoViewPageUrl && settings.screenshots !== "no") {

            let screenshots = [];
            if (info_source == "AnimeTosho" || info_source == "AnimeTosho.xyz") {
                if (selectedEpHtml) {
                    screenshots = extractScreenshotsFromHtml(selectedEpHtml);
                } else if (toshoHtml) {
                    screenshots = extractScreenshotsFromHtml(toshoHtml);
                }
            } else if (info_source == "TsukiHime") {
                for (vidframe of currentFile?.vidframes) {
                    screenshots.push({
                        "url": `https://storage.tsukihime.org/sframes/${currentFile.id.toString(16).padStart(8, '0').toUpperCase()}_${vidframe}.png`,
                        "thumbnail": `https://storage.tsukihime.org/sframes/${currentFile.id.toString(16).padStart(8, '0').toUpperCase()}_${vidframe}.webp?w=320&h=180`,
                        "title": `Screenshot at ${formatTimestamp(vidframe)}`
                    });
                }
            }
            // console.log(screenshots)
            addScreenshotsToPage(screenshots, fileInfo, subtitles, selectedEpFilename, info_source);
            reorderPanels();
        }
        console.log(`Added screenshots to page: ${performance.now() - startTime}ms`);

        // Deffered FileInfo requiring additional fetch
        if (selectedEpId && info_source == "AnimeTosho.xyz" && settings.fileinfoMode !== "no") {
            // Need to fetch again for the mediainfo, theoretically this could be done after screenshots and attachments are added
            const fileMeta = extractAnimeToshoXyzFileMeta(selectedEpHtml);
            selectedEpFilename = fileMeta.filename || selectedEpFilename;
            const fileInfoLink = fileMeta.fileInfoLink;
            if (!fileInfoLink) {
                console.log("No AnimeTosho.xyz file info link found, skipping fileinfo fetch...");
            } else {
                console.log(`Fetching fileinfo html: ${performance.now() - startTime}ms`);
                selectedEpHtml = await fetchUrl(`https://animetosho.xyz${fileInfoLink}`);
                console.log(`Fetched fileinfo html: ${performance.now() - startTime}ms`);
                fileInfo = await extractFileinfoFromHtml(selectedEpHtml);
                // console.log(fileInfo)
                if (fileInfo && settings.fileinfoMode !== "no") {
                    addFileinfoFeatures(fileInfo, selectedEpFilename, parent, magnet);
                }
            }
        } else if (selectedEpId && info_source === "TsukiHime" && settings.fileinfoMode !== "no") {
            const torrentFile = torrentFiles?.find(file => String(file.id) === String(selectedEpId));
            fileInfo = await fetchTsukihimeFileMediainfo(tsukihime?.id, selectedEpId, torrentFile);
            if (fileInfo && settings.fileinfoMode !== "no") {
                addFileinfoFeatures(fileInfo, selectedEpFilename, parent, magnet);
            }
        }

        reorderPanels();
    }

    function makeFileListClickable(countVidFiles, selectedEpId, torrentFiles) {
        if (countVidFiles <= 1) return;
        if (!torrentFiles) return;

        // Index DOM list items by extracted filename
        const fileListItems = Array.from(document.querySelectorAll('ul li'));
        const filenameToItem = new Map();
        fileListItems.forEach(item => {
            const icon = item.querySelector('i.fa-file');
            if (!icon) return;
            const itemText = item.textContent.trim();
            const fileSizeSpan = item.querySelector('span.file-size');
            let extracted = itemText;
            if (fileSizeSpan) {
                extracted = itemText.replace(fileSizeSpan.textContent, '').trim();
            }
            filenameToItem.set(extracted, item);
        });

        // Single pass over files to attach handlers
        for (const file of torrentFiles) {
            const filename = file.filename.split('/').pop();
            const fileExtension = filename.toLowerCase().split('.').pop();
            if (!['mkv', 'mp4', 'ts'].includes(fileExtension)) continue;

            const item = filenameToItem.get(filename);
            if (!item) continue;

            // Make the item clickable
            item.style.cursor = 'pointer';
            // Add file ID as data attribute
            item.setAttribute('data-file-id', file.id);
            item.setAttribute('data-filename', filename);

            // Mark default selected
            if (String(file.id) === String(selectedEpId)) {
                const fileIcon = item.querySelector('i.fa-file');
                if (fileIcon) fileIcon.className = 'fa fa-file-circle-check';
            }

            item.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();

                const fileId = item.getAttribute('data-file-id');
                const nameFromAttr = item.getAttribute('data-filename');

                // Update the current file info with this file's data
                doDynamicEpisodeFunctions(fileId, nameFromAttr, countVidFiles);

                // Reset all icons
                fileListItems.forEach(li => {
                    const icon = li.querySelector('i.fa-file, i.fa-file-circle-check');
                    if (icon) icon.className = 'fa fa-file';
                    li.style.backgroundColor = '';
                });

                // Highlight selected
                const fileIcon = item.querySelector('i.fa-file');
                if (fileIcon) fileIcon.className = 'fa fa-file-circle-check';
            });
        }
    }

    doDynamicEpisodeFunctions(selectedEpId, selectedEpFilename, countVidFiles, toshoViewPageUrl);
    makeFileListClickable(countVidFiles, selectedEpId, torrentFiles);

    // Delayed fetch so that the other ones are available faster
    if (settings.anilist || settings.myanimelist) {
        if (!linkMap) linkMap = await fetchAnidbLinkMap(anidb_aid, anidbConnectingAPI);
        anilist.href = linkMap.anilist;
        mal.href = linkMap.mal;
    }
}

function reorderPanels() {
    const descPanel = document.querySelector('#torrent-description')?.closest('.panel');
    if (!descPanel) return;
    const groupWrapper = descPanel.closest('.nyat-panel-group');
    const container = groupWrapper?.parentNode || descPanel.parentNode;
    if (!container) return;

    const fileListPanel = document.querySelector('.torrent-file-list')?.closest('.panel');
    const commentsPanel = document.getElementById('comments');

    const panelMap = {
        description: descPanel,
        filelist: fileListPanel,
        fileinfo: document.getElementById('nyat-fileinfo-panel'),
        screenshots: document.getElementById('nyat-screenshots-panel'),
        attachments: document.getElementById('nyat-attachments-panel'),
        comments: commentsPanel,
    };
    const layout = normalizePanelLayout(settings.panelLayout || createDefaultPanelLayout());

    // Remove any previously rendered group wrappers so the layout can be rebuilt cleanly.
    [...container.querySelectorAll('.nyat-panel-group')].forEach(group => {
        const groupContent = group.querySelector('.nyat-group-content');
        if (groupContent) {
            [...groupContent.children].forEach(child => {
                if (child.classList?.contains('panel')) {
                    container.insertBefore(child, group);
                }
            });
        }
        group.remove();
    });

    const managedPanels = panelKeys.map(key => panelMap[key]).filter(panel => panel && panel.parentNode === container);
    if (!managedPanels.length) return;

    const allChildren = [...container.children];
    const maxIdx = Math.max(...managedPanels.map(panel => allChildren.indexOf(panel)));
    const insertRef = allChildren[maxIdx + 1] || null;

    const getActionSource = (panel) => {
        if (panel.__nyatGroupAction) {
            return panel.__nyatGroupAction;
        }
        const heading = panel.querySelector('.panel-heading');
        const leftSection = heading?.querySelector('.nyat-panel-left');
        if (leftSection) {
            panel.__nyatGroupAction = leftSection;
            return leftSection;
        }
        return null;
    };

    const buildGroupWrapper = (groupItem, groupPanelEntries) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'panel panel-default nyat-panel-group';

        const heading = document.createElement('div');
        heading.className = 'panel-heading nyat-panel-heading nyat-group-heading';

        const tabs = document.createElement('div');
        tabs.className = 'nyat-group-tabs nyat-panel-title';

        const actions = document.createElement('div');
        actions.className = 'nyat-group-actions';

        const tabBar = document.createElement('div');
        tabBar.className = 'nyat-group-tabbar';
        tabBar.appendChild(tabs);

        const content = document.createElement('div');
        content.className = 'panel-body nyat-group-content';

        heading.appendChild(tabBar);
        wrapper.appendChild(heading);
        wrapper.appendChild(content);

        const groupPanels = groupPanelEntries.map(entry => entry.panel);
        if (groupPanels.length <= 1) {
            wrapper.classList.add('nyat-group-single');
        }

        makePanelCollapsible(wrapper);
        const groupChevron = heading.querySelector('.nyat-chevron');
        if (groupChevron) {
            tabBar.appendChild(groupChevron);
        }

        const getPanelLabel = (panel, fallbackKey) => {
            const titleEl = panel.querySelector('.panel-title');
            const label = titleEl?.textContent?.trim();
            if (label) return label;
            return panelLabels[fallbackKey] || fallbackKey;
        };

        const refreshTabLabels = () => {
            const buttons = tabs.querySelectorAll('button');
            groupPanelEntries.forEach((entry, idx) => {
                const label = getPanelLabel(entry.panel, entry.key);
                if (buttons[idx]) buttons[idx].textContent = label;
            });
        };

        const groupKey = groupItem.title || 'Group';
        let activeIndex = 0;
        const savedKey = groupTabState[groupKey];
        const savedIndex = groupPanelEntries.findIndex(entry => entry.key === savedKey);
        if (savedIndex >= 0) {
            activeIndex = savedIndex;
        }
        const knownPanels = groupKnownPanels[groupKey] || (groupKnownPanels[groupKey] = new Set());
        let hasNewPanel = false;
        groupPanelEntries.forEach(entry => {
            if (!knownPanels.has(entry.key)) {
                hasNewPanel = true;
                knownPanels.add(entry.key);
            }
        });
        if (hasNewPanel) {
            activeIndex = 0;
        }

        const activateTab = (index) => {
            activeIndex = index;
            groupTabState[groupKey] = groupPanelEntries[index]?.key;
            tabs.querySelectorAll('button').forEach((button, idx) => {
                button.classList.toggle('active', idx === index);
            });
            refreshTabLabels();
            groupPanels.forEach((panel, idx) => {
                panel.style.display = idx === index ? '' : 'none';
                const body = panel.querySelector('.panel-body');
                if (body) {
                    body.style.display = '';
                }
            });
            actions.replaceChildren();
            const activePanel = groupPanels[index];
            if (!activePanel) return;
            const activeHeading = activePanel.querySelector('.panel-heading');
            if (activeHeading) activeHeading.style.display = 'none';
            const actionSource = getActionSource(activePanel);
            if (actionSource) {
                actions.style.display = 'flex';
                actions.appendChild(actionSource);
                actions.querySelectorAll('button, select').forEach(ctrl => {
                    if (ctrl.style.visibility === 'hidden') {
                        ctrl.style.visibility = '';
                    }
                });
            } else {
                actions.style.display = 'none';
            }
        };

        groupPanelEntries.forEach((entry, index) => {
            const panel = entry.panel;
            const panelHeading = panel.querySelector('.panel-heading');
            if (panelHeading) panelHeading.style.display = 'none';
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'nyat-group-tab';
            button.dataset.noCollapse = 'true';
            button.dataset.alwaysVisible = 'true';
            button.textContent = getPanelLabel(panel, entry.key);
            button.addEventListener('click', () => activateTab(index));
            tabs.appendChild(button);
            content.appendChild(panel);

            const observer = new MutationObserver(() => refreshTabLabels());
            observer.observe(panel, { childList: true, subtree: true, characterData: true });
        });

        tabs.appendChild(actions);

        if (groupPanels.length > 0) {
            activateTab(activeIndex);
        }

        refreshTabLabels();

        return wrapper;
    };

    for (const item of layout) {
        if (item.type === 'panel') {
            const panel = panelMap[item.key];
            if (panel && panel.parentNode === container) {
                container.insertBefore(panel, insertRef);
            }
            continue;
        }

        const groupPanelEntries = item.panels
            .map(key => ({ key, panel: panelMap[key] }))
            .filter(entry => entry.panel && entry.panel.parentNode === container);
        if (!groupPanelEntries.length) continue;

        const groupWrapper = buildGroupWrapper(item, groupPanelEntries);
        container.insertBefore(groupWrapper, insertRef);
    }
}

async function doSettings() {
    function mergeSettings(defaultSettings, userSettings) {
        const mergedSettings = { ...defaultSettings };
        const legacyPanelLayout = Array.isArray(userSettings.panelOrder)
            ? userSettings.panelOrder.map(key => ({ type: 'panel', key }))
            : null;
        // Preserve user-defined values
        for (const key in userSettings) {
            if (!(key in defaultSettings)) continue;
            // For force updating legacy default filters
            if (key === "languageFilters" && JSON.stringify(userSettings.languageFilters) == JSON.stringify(["eng", "enm", "und"])) {
                mergedSettings.languageFilters = defaultSettings.languageFilters;
                continue;
            }
            mergedSettings[key] = userSettings[key];
        }
        if (!userSettings.panelLayout && legacyPanelLayout) {
            mergedSettings.panelLayout = legacyPanelLayout;
        }

        return mergedSettings;
    }

    // Load settings or initialize with defaults
    const userSettings = await GM.getValue("settings", {});
    settings = mergeSettings(defaultSettings, userSettings);
    const legacyPanelLayout = Array.isArray(userSettings.panelOrder)
        ? userSettings.panelOrder.map(key => ({ type: 'panel', key }))
        : null;
    settings.panelLayout = normalizePanelLayout(userSettings.panelLayout || legacyPanelLayout || settings.panelLayout || createDefaultPanelLayout());

    // Save settings function
    async function saveSettings() {
        const updatedSettings = {};
        // Validate highlighterStyle first
        const highlighterEl = document.getElementById('setting-highlighterStyle');
        if (highlighterEl) {
            const val = highlighterEl.value.trim();
            const styleName = await getValidHighlighterStyle(val);
            if (styleName !== val) {
                alert(`Highlight.js style '${val}' was not found. Please update your highlighterStyle with a valid highlight.js style.`);
                return;
            }
        }
        Object.keys(settings).forEach(key => {
            if (key === "panelLayout") {
                const layoutRoot = document.getElementById('setting-panelLayout');
                if (!layoutRoot) return;
                updatedSettings[key] = readPanelLayoutFromEditor(layoutRoot);
                return;
            }
            const el = document.getElementById(`setting-${key}`);
            if (!el) return;
            if (key === "highlighterStyle") {
                updatedSettings[key] = el.value.trim();
            } else if (key === "fileinfoHeight") {
                updatedSettings[key] = Math.max(80, parseInt(el.value, 10) || 420);
            } else if (key === "highlighterCharCap") {
                updatedSettings[key] = parseInt(el.value, 10) || 100000;
            } else if (typeof defaultSettings[key] === "boolean") {
                updatedSettings[key] = el.checked;
            } else if (Array.isArray(defaultSettings[key])) {
                updatedSettings[key] = el.value.split(",").map(s => s.trim());
            } else {
                updatedSettings[key] = el.value;
            }
        });
        if (updatedSettings.description === 'hide' && !updatedSettings.descriptionHeader) {
            alert('Description cannot be set to "Hide" without Panel header enabled. Please enable Panel header or change Description to "Show".');
            return;
        }
        await GM.setValue("settings", updatedSettings);
        closeSettingsUI();
        location.reload(); // Reload page to reflect changes
    }

    // Close settings UI
    function closeSettingsUI() {
        const settingsUI = document.getElementById("settings-ui");
        if (settingsUI) settingsUI.remove();
    }

    function readPanelLayoutFromEditor(layoutRoot) {
        const readList = (listRoot) => {
            const out = [];
            const usedGroupTitles = new Set();
            [...listRoot.children].forEach(item => {
                if (item.dataset.type === 'panel') {
                    out.push({ type: 'panel', key: item.dataset.panelKey });
                    return;
                }
                if (item.dataset.type !== 'group') return;
                const groupPanels = [...item.querySelectorAll('.nyat-order-group-panels > .nyat-order-item')]
                    .map(panel => panel.dataset.panelKey)
                    .filter(Boolean);
                const titleInput = item.querySelector('.nyat-group-title-input');
                const rawTitle = titleInput?.value.trim() || 'Group';
                const title = makeUniqueGroupTitle(rawTitle, usedGroupTitles);
                if (titleInput && titleInput.value !== title) {
                    titleInput.value = title;
                }
                out.push({
                    type: 'group',
                    title,
                    panels: groupPanels,
                });
            });
            return out;
        };

        return normalizePanelLayout(readList(layoutRoot));
    }

    function buildPanelLayoutEditor(layoutRoot) {
        const root = layoutRoot;
        const orderedLayout = normalizePanelLayout(settings.panelLayout || createDefaultPanelLayout());

        const groupCardById = new Map();

        function getGroupCards() {
            return [...root.querySelectorAll('.nyat-order-group')];
        }

        function getGroupTitleSet(excludeTitle = '') {
            const titles = new Set();
            getGroupCards().forEach(card => {
                const title = card.dataset.groupId || '';
                if (title && title !== excludeTitle) {
                    titles.add(title);
                }
            });
            return titles;
        }

        function ensureUniqueGroupTitle(title, excludeTitle = '') {
            return makeUniqueGroupTitle(title, getGroupTitleSet(excludeTitle));
        }

        function renameGroupCard(groupCard, nextTitle) {
            const previousTitle = groupCard.dataset.groupId || '';
            const uniqueTitle = ensureUniqueGroupTitle(nextTitle, previousTitle);
            if (previousTitle === uniqueTitle) {
                return;
            }
            groupCard.dataset.groupId = uniqueTitle;
            const titleInput = groupCard.querySelector('.nyat-group-title-input');
            if (titleInput && titleInput.value !== uniqueTitle) {
                titleInput.value = uniqueTitle;
            }
            root.querySelectorAll('.nyat-order-item[data-type="panel"]').forEach(panelCard => {
                if ((panelCard.dataset.groupId || '') === previousTitle) {
                    panelCard.dataset.groupId = uniqueTitle;
                }
            });
            if (previousTitle) {
                groupCardById.delete(previousTitle);
            }
            groupCardById.set(uniqueTitle, groupCard);
            refreshAllControls();
        }

        function refreshGroupSelects() {
            const groups = getGroupCards();
            const groupOptions = groups.map(groupCard => ({
                id: groupCard.dataset.groupId,
                title: groupCard.querySelector('.nyat-group-title-input')?.value.trim() || groupCard.dataset.groupId || 'Group',
            }));

            root.querySelectorAll('.nyat-order-item[data-type="panel"]').forEach(panelCard => {
                const currentValue = panelCard.dataset.groupId || '';
                const groupSelect = panelCard.querySelector('.nyat-panel-group-select');
                if (!groupSelect) return;
                groupSelect.innerHTML = `<option value="">No group</option>` + groupOptions.map(group =>
                    `<option value="${group.id}" ${currentValue === group.id ? 'selected' : ''}>${group.title}</option>`
                ).join('');
            });
        }

        function refreshMoveButtons(listRoot) {
            const items = [...listRoot.children].filter(item => item.dataset.type === 'panel' || item.dataset.type === 'group');
            items.forEach((item, index) => {
                const up = item.querySelector('.move-up');
                const down = item.querySelector('.move-down');
                if (up) up.disabled = index === 0;
                if (down) down.disabled = index === items.length - 1;
            });
        }

        function refreshAllControls() {
            refreshMoveButtons(root);
            root.querySelectorAll('.nyat-order-group-panels').forEach(list => refreshMoveButtons(list));
            refreshGroupSelects();
        }

        function moveItemWithinList(item, direction) {
            const listRoot = item.parentElement;
            if (!listRoot) return;
            const items = [...listRoot.children].filter(child => child.dataset.type === 'panel' || child.dataset.type === 'group');
            const index = items.indexOf(item);
            const targetIndex = index + direction;
            if (index < 0 || targetIndex < 0 || targetIndex >= items.length) return;
            if (direction < 0) {
                listRoot.insertBefore(item, items[targetIndex]);
            } else {
                listRoot.insertBefore(item, items[targetIndex].nextSibling);
            }
            refreshAllControls();
        }

        function movePanelToGroup(panelCard, groupId) {
            const currentGroupId = panelCard.dataset.groupId || '';
            if (currentGroupId === groupId) return;

            const previousGroupCard = panelCard.closest('.nyat-order-group');
            const targetGroupCard = groupId ? groupCardById.get(groupId) : null;
            const rootInsertRef = previousGroupCard ? previousGroupCard.nextSibling : null;

            if (targetGroupCard) {
                targetGroupCard.querySelector('.nyat-order-group-panels').appendChild(panelCard);
                panelCard.dataset.groupId = groupId;
            } else {
                panelCard.dataset.groupId = '';
                if (previousGroupCard) {
                    root.insertBefore(panelCard, rootInsertRef);
                } else {
                    root.appendChild(panelCard);
                }
            }

            refreshAllControls();
        }

        function createPanelCard(panelKey, groupId = '') {
            const panelCard = document.createElement('div');
            panelCard.className = 'nyat-order-item';
            panelCard.dataset.type = 'panel';
            panelCard.dataset.panelKey = panelKey;
            panelCard.dataset.groupId = groupId;

            panelCard.innerHTML = `
                <span class="nyat-order-label">${panelLabels[panelKey] || panelKey}</span>
                <select class="nyat-panel-group-select"></select>
                <div class="move-btns">
                    <button class="move-btn move-up" title="Move up">&#9650;</button>
                    <button class="move-btn move-down" title="Move down">&#9660;</button>
                </div>
            `;

            const groupSelect = panelCard.querySelector('.nyat-panel-group-select');
            groupSelect.addEventListener('change', () => movePanelToGroup(panelCard, groupSelect.value));

            panelCard.querySelector('.move-up').addEventListener('click', e => {
                e.stopPropagation();
                moveItemWithinList(panelCard, -1);
            });
            panelCard.querySelector('.move-down').addEventListener('click', e => {
                e.stopPropagation();
                moveItemWithinList(panelCard, 1);
            });

            return panelCard;
        }

        function createGroupCard(groupItem) {
            const groupCard = document.createElement('div');
            groupCard.className = 'nyat-order-group';
            groupCard.dataset.type = 'group';
            const uniqueTitle = ensureUniqueGroupTitle(groupItem.title || 'Group');
            groupCard.dataset.groupId = uniqueTitle;

            const header = document.createElement('div');
            header.className = 'nyat-order-group-header';

            header.innerHTML = `
                <div class="nyat-order-group-title-row">
                    <input class="nyat-group-title-input" type="text" value="${uniqueTitle.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">
                    <button class="move-btn remove-group" title="Remove group" aria-label="Remove group"><i class="fa-solid fa-trash"></i></button>

                    <div class="move-btns">
                        <button class="move-btn move-up" title="Move up">&#9650;</button>
                        <button class="move-btn move-down" title="Move down">&#9660;</button>
                    </div>
                </div>
            `;

            const titleInput = header.querySelector('.nyat-group-title-input');
            titleInput.addEventListener('change', () => {
                renameGroupCard(groupCard, titleInput.value);
            });

            const body = document.createElement('div');
            body.className = 'nyat-order-group-body';

            const panelList = document.createElement('div');
            panelList.className = 'nyat-order-group-panels';
            body.appendChild(panelList);

            groupCard.appendChild(header);
            groupCard.appendChild(body);

            groupCard.querySelector('.move-up').addEventListener('click', e => {
                e.stopPropagation();
                moveItemWithinList(groupCard, -1);
            });
            groupCard.querySelector('.move-down').addEventListener('click', e => {
                e.stopPropagation();
                moveItemWithinList(groupCard, 1);
            });
            groupCard.querySelector('.remove-group').addEventListener('click', e => {
                e.stopPropagation();
                [...panelList.querySelectorAll('.nyat-order-item[data-type="panel"]')].reverse().forEach(panelCard => {
                    panelCard.dataset.groupId = '';
                    root.insertBefore(panelCard, groupCard.nextSibling);
                });
                groupCardById.delete(groupCard.dataset.groupId);
                groupCard.remove();
                refreshAllControls();
            });

            groupCardById.set(groupCard.dataset.groupId, groupCard);
            return groupCard;
        }

        root.innerHTML = '';
        orderedLayout.forEach(item => {
            if (item.type === 'group') {
                const groupCard = createGroupCard(item);
                root.appendChild(groupCard);
                item.panels.forEach(panelKey => {
                    const panelCard = createPanelCard(panelKey, groupCard.dataset.groupId);
                    groupCard.querySelector('.nyat-order-group-panels').appendChild(panelCard);
                });
            } else {
                root.appendChild(createPanelCard(item.key));
            }
        });

        refreshAllControls();
        return { refreshAllControls, createGroupCard, createPanelCard };
    }

    // Show settings UI
    // Inject settings stylesheet once
    if (!document.getElementById('nyat-settings-styles')) {
        const style = document.createElement('style');
        style.id = 'nyat-settings-styles';
        style.textContent = `
            #settings-ui {
                position: fixed; top: 10px; right: 10px;
                width: 390px; max-width: 95vw; max-height: 90vh;
                background: #2a2a2a; border: 1px solid #555; border-radius: 10px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.5); font-family: Arial, sans-serif;
                z-index: 10000; display: flex; flex-direction: column; overflow: hidden;
            }
            #settings-ui .s-header {
                padding: 14px 16px 0; color: #fff; font-size: 16px; font-weight: 700;
                display: flex; align-items: center; gap: 8px; flex-shrink: 0;
            }
            #settings-ui .s-tabs {
                display: flex; gap: 2px; padding: 10px 16px 0; flex-shrink: 0;
            }
            #settings-ui .s-tab {
                padding: 6px 14px; border-radius: 6px 6px 0 0; cursor: pointer;
                background: #1e1e1e; color: #aaa; font-size: 13px; font-weight: 600;
                border: 1px solid #444; border-bottom: none; user-select: none;
                transition: background 0.15s, color 0.15s;
            }
            #settings-ui .s-tab:hover { background: #333; color: #ddd; }
            #settings-ui .s-tab.active { background: #3a3a3a; color: #fff; border-color: #666; }
            #settings-ui .s-body {
                flex: 1; overflow-y: auto; padding: 16px;
                background: #3a3a3a; border-top: 1px solid #666;
            }
            #settings-ui .s-pane { display: none; }
            #settings-ui .s-pane.active { display: block; }
            #settings-ui label {
                display: flex; align-items: center; margin-bottom: 9px;
                color: #e0e0e0; font-size: 13px;
            }
            #settings-ui label > span {
                display: inline-block; width: 155px; font-weight: 600; color: #ccc; flex-shrink: 0;
            }
            #settings-ui input[type="text"], #settings-ui input[type="number"],
            #settings-ui select, #settings-ui textarea {
                width: 170px; box-sizing: border-box; color: #222; padding: 5px 7px;
                border: 1px solid #bbb; border-radius: 5px; font-family: inherit;
                font-size: 13px; background: #f5f5f5; margin: 0; flex-shrink: 0;
            }
            #settings-ui input[type="checkbox"] { transform: scale(1.2); margin: 0; flex-shrink: 0; }
            #settings-ui .s-section-title {
                color: #88c0d0; font-size: 12px; font-weight: 700; text-transform: uppercase;
                letter-spacing: 0.8px; margin: 14px 0 8px; padding-bottom: 4px;
                border-bottom: 1px solid #555;
            }
            #settings-ui .s-indent { margin-left: 20px; }
            #settings-ui .s-footer {
                display: flex; justify-content: flex-end; gap: 8px;
                padding: 12px 16px; background: #2a2a2a; flex-shrink: 0;
                border-top: 1px solid #444;
            }
            #settings-ui .s-btn {
                padding: 7px 18px; border: none; border-radius: 6px; cursor: pointer;
                font-size: 13px; font-weight: 600; transition: background 0.15s;
            }
            #settings-ui .s-btn-save { background: #4CAF50; color: #fff; }
            #settings-ui .s-btn-save:hover { background: #45a049; }
            #settings-ui .s-btn-close { background: #555; color: #eee; }
            #settings-ui .s-btn-close:hover { background: #666; }
            .nyat-order-item {
                display: flex; align-items: center; gap: 8px;
                background: #2e2e2e; border: 1px solid #555; border-radius: 6px;
                padding: 7px 10px; margin-bottom: 5px; cursor: default; user-select: none;
                color: #e0e0e0; font-size: 13px;
            }
            .nyat-order-item:active { cursor: default; }
            .nyat-order-item.drag-over { border-color: #4CAF50; background: #1e3a1e; }
            .nyat-order-group.drag-over { border-color: #4CAF50; background: #1e3a1e; }
            .nyat-order-item.dragging, .nyat-order-group.dragging { opacity: 0.6; }
            .nyat-order-item .move-btns { display: flex; flex-direction: column; gap: 2px; margin-left: auto; }
            .nyat-order-item .move-btn {
                background: #3f3f3f; border: 1px solid #6b6b6b; color: #ddd;
                border-radius: 3px; padding: 0 5px; font-size: 10px; line-height: 14px;
                cursor: pointer; user-select: none;
            }
            .nyat-order-item .move-btn:hover { background: #555; border-color: #7a7a7a; color: #fff; }
            .nyat-order-item .move-btn:disabled { opacity: 0.3; cursor: default; }
            .nyat-order-toolbar {
                display: flex; align-items: center; justify-content: space-between; gap: 10px;
                margin-bottom: 10px;
            }
            .nyat-order-help {
                color: #999; font-size: 12px; margin-top: 10px;
            }
            .nyat-order-group {
                background: #2e2e2e; border: 1px solid #555; border-radius: 8px;
                padding: 10px; margin-bottom: 8px;
            }
            .nyat-order-group-header {
                display: flex; flex-direction: column; gap: 8px;
            }
            .nyat-order-group-title-row {
                display: flex; align-items: center; gap: 8px;
            }
            .nyat-group-title-input {
                flex: 1; min-width: 0; box-sizing: border-box; color: #222; padding: 5px 7px;
                border: 1px solid #bbb; border-radius: 5px; font-family: inherit; font-size: 13px;
                background: #f5f5f5;
            }
            .nyat-order-group-body {
                margin-top: 8px; padding-left: 22px;
            }
            .nyat-order-group-panels {
                display: flex; flex-direction: column; gap: 6px;
            }
            .nyat-order-group .nyat-order-item {
                margin-bottom: 0;
            }
            .nyat-order-group .move-btns { display: flex; flex-direction: column; gap: 2px; margin-left: auto; }
            .nyat-order-group .move-btn {
                background: #3f3f3f; border: 1px solid #6b6b6b; color: #ddd;
                border-radius: 3px; padding: 0 5px; font-size: 10px; line-height: 14px;
                cursor: pointer; user-select: none;
            }
            .nyat-order-group .remove-group {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 2px 6px;
            }
            .nyat-order-group .remove-group i {
                font-size: 14px;
                line-height: 1;
            }
            .nyat-order-group .move-btn:hover { background: #555; border-color: #7a7a7a; color: #fff; }
            .nyat-order-group .move-btn:disabled { opacity: 0.3; cursor: default; }
        `;
        document.head.appendChild(style);
    }

    async function showSettingsUI() {
        const existingUI = document.getElementById("settings-ui");
        if (existingUI) { existingUI.remove(); return; }

        // ── HTML helpers ──────────────────────────────────────────────────────
        const s = v => v === undefined ? '' : String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        const chk = (id, val, label) =>
            `<label><span>${label}:</span><input type="checkbox" id="setting-${id}" ${val ? 'checked' : ''}></label>`;
        const sel = (id, val, opts) =>
            `<label><span>${opts.label}:</span><select id="setting-${id}">${opts.options.map(([v, t]) => `<option value="${s(v)}" ${val === v ? 'selected' : ''}>${t}</option>`).join('')
            }</select></label>`;
        const num = (id, val, label, min, step) =>
            `<label><span>${label}:</span><input type="number" id="setting-${id}" value="${s(val)}" min="${min}" step="${step}"></label>`;
        const txt = (id, val, label, extraStyle = '') =>
            `<label><span>${label}:</span><input type="text" id="setting-${id}" value="${s(val)}"></label>`;
        const sec = title => `<div class="s-section-title">${title}</div>`;
        const sub = (id, show, cls = '') =>
            `<div id="${id}"${cls ? ` class="${cls}"` : ''} style="${show ? '' : 'display:none;'}">`;

        // ── Build UI ──────────────────────────────────────────────────────────
        const settingsUI = document.createElement('div');
        settingsUI.id = 'settings-ui';
        settingsUI.innerHTML = `
            <div class="s-header"><i class="fa fa-cog"></i> Nyaa-AnimeTosho Extender</div>
            <div class="s-tabs">
                <div class="s-tab active" data-tab="general">General</div>
                <div class="s-tab" data-tab="panels">Panels</div>
                <div class="s-tab" data-tab="order">Order</div>
            </div>
            <div class="s-body">

                <div class="s-pane active" id="s-pane-general">
                    ${sec('Interface')}
                    ${sel('settingsPosition', settings.settingsPosition, { label: 'Settings position', options: [['navbar', 'Navbar'], ['user dropdown', 'User dropdown']] })}
                    ${sec('Links')}
                    ${chk('anidb', settings.anidb, 'AniDB')}
                    ${chk('myanimelist', settings.myanimelist, 'MyAnimeList')}
                    ${chk('anilist', settings.anilist, 'AniList')}
                    ${chk('animetosho', settings.animetosho, 'Source site')}
                    ${chk('nekobt', settings.nekobt, 'NekoBT')}
                    ${sec('NZB Download')}
                    ${chk('nzb', settings.nzb, 'Enable NZB')}
                    ${sub('setting-nzb-subopts', settings.nzb)}
                        ${txt('sabUrl', settings.sabUrl, 'SABnzbd URL')}
                        ${txt('nzbKey', settings.nzbKey, 'API key')}
                    </div>
                </div>

                <div class="s-pane" id="s-pane-panels">
                    ${sec('Description')}
                    ${sel('description', settings.description, { label: 'Description', options: [['no', 'No'], ['hide', 'Hide'], ['show', 'Show']] })}
                    <label id="setting-descriptionHeader-row" style="${settings.description !== 'no' ? '' : 'display:none;'}">
                        <span>Panel header:</span><input type="checkbox" id="setting-descriptionHeader" ${settings.descriptionHeader ? 'checked' : ''}>
                    </label>

                    ${sec('FileInfo')}
                    ${sel('fileinfoMode', settings.fileinfoMode, { label: 'Show as', options: [['no', 'No'], ['item', 'Footer link only'], ['panel', 'Panel only'], ['both', 'Both']] })}
                    ${sub('setting-fileinfo-panel-opts', settings.fileinfoMode === 'panel' || settings.fileinfoMode === 'both')}
                        ${sel('fileinfoPanel', settings.fileinfoPanel, { label: 'Panel state', options: [['hide', 'Hide'], ['show', 'Show']] })}
                        ${num('fileinfoHeight', settings.fileinfoHeight, 'Initial height (px)', 80, 20)}
                    </div>

                    ${sec('Screenshots')}
                    ${sel('screenshots', settings.screenshots, { label: 'Screenshots', options: [['no', 'No'], ['hide', 'Hide'], ['show', 'Show']] })}
                    ${sub('setting-screenshots-subopts', settings.screenshots !== 'no', 's-indent')}
                        ${sel('previewSize', settings.previewSize, { label: 'Preview size', options: [['compact', 'Compact'], ['medium', 'Medium'], ['large', 'Large'], ['huge', 'Huge']] })}
                        ${sel('subsByDefault', settings.subsByDefault, { label: 'Subs by default', options: [['no', 'None'], ['first', 'First track'], ['first-nonforced', 'First non-forced']] })}
                    </div>

                    ${sec('Attachments')}
                    ${sel('attachments', settings.attachments, { label: 'Attachments', options: [['no', 'No'], ['hide', 'Hide'], ['show', 'Show']] })}
                    ${sub('setting-attachments-subopts', settings.attachments !== 'no', 's-indent')}
                        ${sel('attachmentAction', settings.attachmentAction, { label: 'Action', options: [['view', 'View'], ['download', 'Download'], ['download extracted', 'Download extracted']] })}
                        ${sub('setting-highlighter-subopts', settings.attachmentAction === 'view')}
                            <label><span>Highlighter style:</span>
                                <textarea id="setting-highlighterStyle" rows="1" style="resize:none;overflow:hidden;min-height:30px;max-height:30px;white-space:nowrap;">${s(settings.highlighterStyle)}</textarea>
                            </label>
                            ${num('highlighterCharCap', settings.highlighterCharCap, 'Highlighter cap', 0, 10000)}
                        </div>
                        ${chk('filtersByDefault', settings.filtersByDefault, 'Filter by default')}
                        <label><span>Language filters:</span>
                            <textarea id="setting-languageFilters" rows="1" style="resize:none;overflow-x:auto;overflow-y:hidden;white-space:nowrap;min-height:30px;">${s(Array.isArray(settings.languageFilters) ? settings.languageFilters.join(',') : settings.languageFilters)}</textarea>
                        </label>
                    </div>
                </div>

                <div class="s-pane" id="s-pane-order">
                    ${sec('Panel Order')}
                    <div class="nyat-order-toolbar">
                        <button class="s-btn s-btn-close" id="add-panel-group" type="button">Add Group</button>
                    </div>
                    <div id="setting-panelLayout"></div>
                </div>

            </div>
            <div class="s-footer">
                <button class="s-btn s-btn-close" id="close-settings">Cancel</button>
                <button class="s-btn s-btn-save" id="save-settings">Save &amp; Reload</button>
            </div>
        `;

        // ── Tab switching ─────────────────────────────────────────────────────
        settingsUI.querySelectorAll('.s-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                settingsUI.querySelectorAll('.s-tab').forEach(t => t.classList.remove('active'));
                settingsUI.querySelectorAll('.s-pane').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                settingsUI.querySelector(`#s-pane-${tab.dataset.tab}`).classList.add('active');
            });
        });

        // ── Panel order editor ───────────────────────────────────────────────
        const layoutRoot = settingsUI.querySelector('#setting-panelLayout');
        const layoutEditor = buildPanelLayoutEditor(layoutRoot);

        settingsUI.querySelector('#add-panel-group').addEventListener('click', () => {
            const groupCard = layoutEditor.createGroupCard({ title: 'Group', panels: [] });
            layoutRoot.appendChild(groupCard);
            layoutEditor.refreshAllControls();
        });

        // ── Dependent show/hide ───────────────────────────────────────────────
        const toggleVis = (triggerId, targetId, test) =>
            settingsUI.querySelector(triggerId).addEventListener('change', function () {
                settingsUI.querySelector(targetId).style.display = test(this) ? '' : 'none';
            });
        toggleVis('#setting-description', '#setting-descriptionHeader-row', el => el.value !== 'no');
        toggleVis('#setting-nzb', '#setting-nzb-subopts', el => el.checked);
        toggleVis('#setting-fileinfoMode', '#setting-fileinfo-panel-opts', el => el.value === 'panel' || el.value === 'both');
        toggleVis('#setting-screenshots', '#setting-screenshots-subopts', el => el.value !== 'no');
        toggleVis('#setting-attachments', '#setting-attachments-subopts', el => el.value !== 'no');
        toggleVis('#setting-attachmentAction', '#setting-highlighter-subopts', el => el.value === 'view');

        // Append settings UI to the body
        document.body.appendChild(settingsUI);

        // --- Add close on outside click and Escape ---
        function handleSettingsClick(e) {
            // Ignore clicks on the navbar settings link
            if (e.target.closest('#nyat-settings-link')) return;
            if (!settingsUI.contains(e.target)) {
                closeSettingsUI();
            }
        }
        function handleSettingsEsc(e) {
            if (e.key === "Escape") {
                closeSettingsUI();
            }
        }
        setTimeout(() => {
            document.addEventListener('mousedown', handleSettingsClick);
            document.addEventListener('keydown', handleSettingsEsc);
        }, 0);
        // Patch closeSettingsUI to remove listeners
        const origCloseSettingsUI = closeSettingsUI;
        closeSettingsUI = function () {
            document.removeEventListener('mousedown', handleSettingsClick);
            document.removeEventListener('keydown', handleSettingsEsc);
            origCloseSettingsUI();
        };
        // --- End close on outside click/Esc ---

        // Function to add auto-expand functionality to textareas
        function addTextareaAutoExpand() {
            const textareas = settingsUI.querySelectorAll('textarea');

            textareas.forEach(textarea => {
                // Auto-expand function
                function autoExpand() {
                    textarea.style.height = 'auto';
                    textarea.style.height = textarea.scrollHeight + 'px';
                }

                // Initial auto-expand
                autoExpand();

                // Add event listeners
                textarea.addEventListener('input', autoExpand);
                textarea.addEventListener('keydown', autoExpand);

                // Add focus/blur effects
                textarea.addEventListener('focus', () => {
                    textarea.style.borderColor = '#4CAF50';
                    textarea.style.boxShadow = '0 0 3px rgba(76, 175, 80, 0.3)';
                });

                textarea.addEventListener('blur', () => {
                    textarea.style.borderColor = '#ccc';
                    textarea.style.boxShadow = 'none';
                });

                // Add hover effect
                textarea.addEventListener('mouseenter', () => {
                    if (document.activeElement !== textarea) {
                        textarea.style.borderColor = '#999';
                    }
                });

                textarea.addEventListener('mouseleave', () => {
                    if (document.activeElement !== textarea) {
                        textarea.style.borderColor = '#ccc';
                    }
                });
            });
        }

        // Auto-expand textareas
        addTextareaAutoExpand();

        // Button events
        settingsUI.querySelector('#save-settings').addEventListener('click', saveSettings);
        settingsUI.querySelector('#close-settings').addEventListener('click', closeSettingsUI);
        settingsUI.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'SELECT') {
                e.preventDefault();
                saveSettings();
            }
        });
    }

    // Add settings button to user dropdown menu or navbar based on setting
    if (settings.settingsPosition === 'user dropdown') {
        const userDropdownMenu = document.querySelector('.navbar-nav.navbar-right .dropdown-menu');
        if (userDropdownMenu) {
            const settingsItem = document.createElement("li");
            const settingsLink = document.createElement("a");
            settingsLink.innerHTML = ' <i class="fa fa-gear fa-fw" aria-hidden="true"></i> NY-AT';
            settingsLink.title = "Nyaa AnimeTosho Extender Settings";
            settingsLink.style.cursor = "pointer";
            settingsLink.id = "nyat-settings-link";
            settingsLink.addEventListener("click", function (e) {
                e.preventDefault();
                const existingUI = document.getElementById("settings-ui");
                if (existingUI) {
                    existingUI.remove();
                } else {
                    showSettingsUI();
                }
            });
            settingsItem.appendChild(settingsLink);
            // Find the Profile option
            const profileItem = Array.from(userDropdownMenu.querySelectorAll('li > a')).find(a => a.getAttribute('href') === '/profile');
            if (profileItem && profileItem.parentElement) {
                if (profileItem.parentElement.nextSibling) {
                    userDropdownMenu.insertBefore(settingsItem, profileItem.parentElement.nextSibling);
                } else {
                    userDropdownMenu.appendChild(settingsItem);
                }
            } else {
                userDropdownMenu.appendChild(settingsItem);
            }
        }
    } else {
        // Add settings button to main navbar (left side)
        const navbar = document.querySelector(".navbar-nav");
        if (navbar) {
            const settingsItem = document.createElement("li");
            const settingsLink = document.createElement("a");
            settingsLink.innerHTML = ' <i class="fa fa-gear fa-fw" aria-hidden="true"></i> NY-AT';
            settingsLink.title = "Nyaa AnimeTosho Extender Settings";
            settingsLink.style.cursor = "pointer";
            settingsLink.id = "nyat-settings-link";
            settingsLink.addEventListener("click", function (e) {
                e.preventDefault();
                const existingUI = document.getElementById("settings-ui");
                if (existingUI) {
                    existingUI.remove();
                } else {
                    showSettingsUI();
                }
            });
            settingsItem.appendChild(settingsLink);
            navbar.appendChild(settingsItem);
        }
    }
}

(async function () {
    'use strict';
    document.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css">');

    await doSettings();
    await doFeatures();
})();
