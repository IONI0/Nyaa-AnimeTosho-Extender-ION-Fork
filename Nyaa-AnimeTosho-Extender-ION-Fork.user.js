// ==UserScript==
// @name         Nyaa AnimeTosho Extender ION Fork
// @version      0.61-23
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
// @require      https://cdn.jsdelivr.net/npm/xz-decompress@0.2.2/dist/package/xz-decompress.min.js
// @match        https://nyaa.si/view/*
// @run-at       document-end
// ==/UserScript==


// Jimbo's work with some additional features and tweaks (apologies for ai code, I don't know js or html)

const defaultSettings = {
    settingsPosition: "navbar", // "navbar" or "user dropdown"
    anidb: false,
    myanimelist: false,
    anilist: true,
    animetosho: true,
    fileinfo: true,
    nzb: false,
    sabUrl: "http://ip:port/",
    nzbKey: "",
    screenshots: "show", // "no", "hide", or "show"
    previewSize: "compact", // "compact", "medium", "large", "huge"
    subsByDefault: "first-nonforced", // "no", "first", "first-nonforced"
    attachments: "show", // "no", "hide", or "show"
    filtersByDefault: false,
    attachmentAction: "view", // "view", "download", "download extracted"
    highlighterCharCap: 100000, // Under this amount of characters, the highlighter will be enabled by default when viewing
    highlighterStyle: "felipec", // highlight.js style name
    languageFilters: ["eng", "enm", "und"],
}

let settings = {}

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

    heading.style.cursor = "pointer";
    heading.style.display = "flex";
    heading.style.alignItems = "center";
    heading.style.padding = "10px 15px";
    heading.style.maxHeight = "45px";
    heading.style.overflow = "hidden";

    // Add collapse/expand icon if it doesn't exist
    if (!heading.querySelector('i.fa-chevron-down')) {
        const title = heading.querySelector('.panel-title');
        if (title) {
            title.style.margin = "0";
            title.style.fontSize = "16px";
            title.style.fontWeight = "500";
            title.style.flexGrow = "1";
        }

        const icon = document.createElement("i");
        icon.className = "fa-solid fa-chevron-down";
        icon.style.transition = "transform 0.2s";
        icon.style.marginLeft = "10px";
        heading.appendChild(icon);
    }

    const body = panel.querySelector('.panel-body');
    if (!body) return;

    let isCollapsed = startCollapsed;
    // Helper to set visibility of buttons/selects in heading
    function setHeaderControlsVisibility(visible) {
        const controls = heading.querySelectorAll('button, select');
        controls.forEach(ctrl => {
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
        // Don't collapse if clicking the filter button
        if (e.target.closest('.btn')) return;

        isCollapsed = !isCollapsed;
        body.style.display = isCollapsed ? "none" : "block";
        const icon = heading.querySelector('i.fa-chevron-down');
        if (icon) {
            icon.style.transform = isCollapsed ? "rotate(-90deg)" : "rotate(0deg)";
        }
        setHeaderControlsVisibility(!isCollapsed);
    });
}

function extractSubtitlesFromHtml(html) {
    try {
        // Parse the HTML using DOMParser
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        const subtitles = [];
        // Regex to locate the Subtitles section
        const subtitlesRegex = /<th>Extractions<\/th>.*?Subtitles: (.*?)<\/td>/s;
        const alternativeRegex = /<th>Subtitles<\/th>.*?<td>(.*?)<\/td>/s;
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
        // Find the screenshots section using regex
        const screenshotsRegex = /<th>Screenshots<\/th>.*?<td>(.*?)<\/td>/s;
        const match = html.match(screenshotsRegex);

        const screenshots = [];
        if (match && match[1]) {
            // Extract all screenshot links with their titles and thumbnails
            const linkRegex = /<a[^>]*href="([^"]+)"[^>]*title="([^"]+)"[^>]*>.*?<img[^>]*src="([^"]+)"[^>]*>/g;
            let linkMatch;
            while ((linkMatch = linkRegex.exec(match[1])) !== null) {
                // Convert the URL to the storage URL format and preserve track flags
                const storageUrl = linkMatch[1].replace(/.*\/sframes\//, 'https://storage.animetosho.org/sframes/').replace(/&amp;/g, '&');
                const thumbnailUrl = linkMatch[3].replace(/.*\/sframes\//, 'https://storage.animetosho.org/sframes/').replace(/&amp;/g, '&');

                // Extract track flag from the original URL
                const trackMatch = linkMatch[1].match(/s=(\d+)/);
                const trackFlag = trackMatch ? `s=${trackMatch[1]}` : 's=1';

                screenshots.push({
                    url: storageUrl,
                    thumbnail: thumbnailUrl,
                    title: linkMatch[2],
                    track: trackFlag
                });
            }
        }

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
        const el = doc.getElementById('file_addinfo');
        if (!el) return '';
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

    // Create modal overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'screenshot-modal';
    modalOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
    `;

    // Lock scroll position
    const originalScrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${originalScrollY}px`;
    document.body.style.width = '100%';

    // Create modal content container
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        position: relative;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        cursor: default;
    `;

    // Create top bar (fixed to screen)
    const topBar = document.createElement('div');
    topBar.style.cssText = `
        position: fixed;
        top: 15px;
        left: 15px;
        right: 15px;
        height: 40px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        z-index: 10001;
        cursor: default;
    `;

    // Create title element
    const titleElement = document.createElement('div');
    titleElement.style.cssText = `
        color: white;
        font-size: 16px;
        max-width: 80%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        cursor: default;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: flex-start;
        height: 100%;
        padding: 0px 0;
    `;

    // Create episode title element
    const episodeTitleElement = document.createElement('div');
    episodeTitleElement.style.cssText = `
        font-weight: 700;
        font-size: 16px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        line-height: 1.2;
        padding-bottom: 2px;
        width: 100%;
    `;

    // Create screenshot title element
    const screenshotTitle = document.createElement('div');
    screenshotTitle.style.cssText = `
        font-weight: 400;
        font-size: 14px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        opacity: 0.6;
        line-height: 1.2;
        padding-top: 2px;
        width: 100%;
    `;

    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
        display: flex;
        gap: 8px;
        cursor: default;
    `;

    // Create open in new tab button
    const openButton = document.createElement('button');
    openButton.style.cssText = `
        background: rgba(255, 255, 255, 0.1);
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.3);
        padding: 8px;
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        transition: all 0.2s;
    `;
    openButton.innerHTML = '<i class="fa-solid fa-external-link-alt"></i>';
    openButton.title = 'Open in new tab';

    // Create close button
    const closeButton = document.createElement('button');
    closeButton.style.cssText = `
        background: rgba(255, 255, 255, 0.1);
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.3);
        padding: 8px;
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        transition: all 0.2s;
    `;
    closeButton.innerHTML = '<i class="fa-solid fa-times"></i>';
    closeButton.title = 'Close';

    // Create main content area with navigation
    const mainContent = document.createElement('div');
    mainContent.style.cssText = `
        display: flex;
        align-items: center;
        gap: 20px;
        flex: 1;
        min-height: 0;
    `;

    // Create navigation arrows (fixed to screen)
    let leftArrow, rightArrow;
    if (screenshots.length > 1) {
        leftArrow = document.createElement('button');
        leftArrow.style.cssText = `
            position: fixed;
            left: 15px;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(255, 255, 255, 0.1);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.3);
            padding: 12px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
            z-index: 10001;
        `;
        leftArrow.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
        leftArrow.title = 'Previous image';

        rightArrow = document.createElement('button');
        rightArrow.style.cssText = `
            position: fixed;
            right: 15px;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(255, 255, 255, 0.1);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.3);
            padding: 12px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
            z-index: 10001;
        `;
        rightArrow.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
        rightArrow.title = 'Next image';
    }

    // Create image container with safe margins
    const imageContainer = document.createElement('div');
    imageContainer.style.cssText = `
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 1;
        min-height: 60px;
        // max-width: calc(100vw - 120px);
        // max-height: calc(100vh - 120px);
        margin: 65px 70px 45px 65px;
    `;

    // Create main image
    const modalImage = document.createElement('img');
    modalImage.style.cssText = `
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        border-radius: 6px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
        opacity: 0;
        transition: opacity 0.3s ease;
    `;

    // Image preloading cache
    const imageCache = new Map();

    // Create bottom bar with dot indicators (fixed to screen)
    let bottomBar;
    if (screenshots.length > 1) {
        bottomBar = document.createElement('div');
        bottomBar.style.cssText = `
            position: fixed;
            bottom: 15px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10001;
            cursor: default;
            height: 20px;
            padding: 0;
            margin: 0;
        `;

        const dotsContainer = document.createElement('div');
        dotsContainer.style.cssText = `
            display: flex;
            gap: 8px;
            background: rgba(255, 255, 255, 0.1);
            padding: 4px 8px;
            border-radius: 20px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            cursor: default;
            position: relative;
        `;

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
            const dotsContainer = bottomBar.querySelector('div');
            dotsContainer.innerHTML = '';
            screenshots.forEach((_, index) => {
                const dot = document.createElement('button');
                dot.style.cssText = `
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    border: none;
                    cursor: pointer;
                    transition: all 0.2s;
                    background-color: ${index === currentIndex ? 'white' : 'rgba(255, 255, 255, 0.4)'};
                    transform: ${index === currentIndex ? 'scale(1.2)' : 'scale(1)'};
                    margin: 0;
                    padding: 0;
                    display: block;
                `;
                dot.onclick = (e) => {
                    e.stopPropagation();
                    currentIndex = index;
                    updateModal();
                };
                dotsContainer.appendChild(dot);
            });
        }

        // All arrows are always enabled with wrap-around
        if (leftArrow && rightArrow) {
            leftArrow.style.opacity = '1';
            rightArrow.style.opacity = '1';
        }
    }

    // Add hover effects to buttons
    function addHoverEffect(button) {
        button.addEventListener('mouseenter', () => {
            button.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
            button.style.borderColor = 'rgba(255, 255, 255, 0.4)';
            button.style.transform = button.style.transform.includes('translate')
                ? button.style.transform + ' scale(1.05)'
                : 'scale(1.05)';
        });
        button.addEventListener('mouseleave', () => {
            button.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            button.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            button.style.transform = button.style.transform.includes('translate')
                ? button.style.transform.replace(' scale(1.05)', '')
                : 'scale(1)';
        });
    }

    addHoverEffect(openButton);
    addHoverEffect(closeButton);
    if (leftArrow) addHoverEffect(leftArrow);
    if (rightArrow) addHoverEffect(rightArrow);

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

function addScreenshotsToPage(screenshots, fileInfo, subtitles, episodeTitle) {
    if (!screenshots.length || settings.screenshots === "no") return;
    // Remove existing attachments panel if it exists
    const allPanels = document.querySelectorAll('.panel.panel-default');
    let refreshPanel = false;
    let wasCollapsed = false;
    let savedTrackSelection = null;
    allPanels.forEach(panel => {
        const title = panel.querySelector('.panel-title');
        if (title && title.textContent.includes('Screenshots')) {
            // Save the current track selection before removing
            const trackSelector = panel.querySelector('select');
            if (trackSelector) {
                savedTrackSelection = trackSelector.value;
            }
            panel.remove();
            refreshPanel = true;
            const body = panel.querySelector('.panel-body');
            if (body.style.display === 'none') {
                wasCollapsed = true;
            }
        }
    });

    // Create screenshots panel
    const screenshotsPanel = document.createElement("div");
    screenshotsPanel.className = "panel panel-default";

    // Create panel heading
    const heading = document.createElement("div");
    heading.className = "panel-heading";
    heading.style.display = "flex";
    heading.style.alignItems = "center";
    heading.style.padding = "10px 15px";

    // Create a container for the title and track selector
    const leftSection = document.createElement("div");
    leftSection.style.display = "flex";
    leftSection.style.alignItems = "center";
    leftSection.style.flexGrow = "1";

    const title = document.createElement("h3");
    title.className = "panel-title";
    title.textContent = "Screenshots";
    title.style.margin = "0";
    title.style.fontSize = "16px";
    title.style.fontWeight = "500";

    // Create track selector
    const trackSelector = document.createElement("select");
    trackSelector.style.marginLeft = "10px";
    trackSelector.style.padding = "4px 6px";
    trackSelector.style.fontSize = "12px";
    trackSelector.style.borderRadius = "3px";
    trackSelector.style.cursor = "pointer";
    trackSelector.style.minHeight = "24px";
    trackSelector.style.height = "auto";
    trackSelector.style.lineHeight = "1.4";
    trackSelector.style.paddingTop = "2px";
    trackSelector.style.paddingBottom = "2px";

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
        case "compact": columnsPerRow = "5"; break;
        case "medium": columnsPerRow = "3"; break;
        case "large": columnsPerRow = "2"; break;
        case "huge": columnsPerRow = "1"; break;
        default: columnsPerRow = "3";
    }
    gridContainer.style.gridTemplateColumns = `repeat(${columnsPerRow}, 1fr)`;
    gridContainer.style.gap = "10px";
    gridContainer.style.width = "100%";

    // Add CSS for responsive behavior
    const style = document.createElement("style");
    style.textContent = `
        @media (max-width: 1200px) {
            .screenshot-grid {
                grid-template-columns: repeat(${settings.previewSize === "compact" ? "5" :
            settings.previewSize === "medium" ? "3" :
                settings.previewSize === "large" ? "2" :
                    "1"
        }, 1fr) !important;
            }
        }
        @media (max-width: 600px) {
            .screenshot-grid {
                grid-template-columns: repeat(${settings.previewSize === "compact" ? "3" :
            settings.previewSize === "medium" ? "2" :
                settings.previewSize === "large" ? "1" :
                    "1"
        }, 1fr) !important;
            }
        }
    `;
    document.head.appendChild(style);

    gridContainer.classList.add("screenshot-grid");

    function updateScreenshots(trackNum) {
        // Clear existing screenshots
        gridContainer.innerHTML = '';

        // Try to extract aspect ratio from fileInfo
        let aspectRatio = 16 / 9; // default
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
            imgContainer.style.position = "relative";
            imgContainer.style.width = "100%";
            imgContainer.style.paddingBottom = `${aspectRatio * 100}%`;
            imgContainer.style.overflow = "hidden";
            imgContainer.style.borderRadius = "4px";
            imgContainer.style.cursor = "pointer";
            imgContainer.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";

            // Create title overlay
            const titleOverlay = document.createElement("div");
            titleOverlay.style.position = "absolute";
            titleOverlay.style.top = "0";
            titleOverlay.style.left = "0";
            titleOverlay.style.right = "0";
            titleOverlay.style.padding = "4px 8px";
            titleOverlay.style.background = "rgba(0, 0, 0, 0.5)";
            titleOverlay.style.color = "white";
            titleOverlay.style.fontSize = "11px";
            titleOverlay.style.opacity = "0";
            titleOverlay.style.transition = "opacity 0.2s";
            titleOverlay.textContent = title;

            const img = document.createElement("img");
            // Get the base URL without parameters
            // Only add track parameter if a track is selected
            img.src = getImageUrl(url.replace('.png', '.jpg'), trackNum);
            img.style.position = "absolute";
            img.style.top = "0";
            img.style.left = "0";
            img.style.width = "100%";
            img.style.height = "100%";
            img.style.objectFit = "contain";

            // Update container aspect ratio after image loads
            img.onload = () => {
                const aspectRatio = img.naturalHeight / img.naturalWidth;
                imgContainer.style.paddingBottom = `${aspectRatio * 100}%`;
            };

            imgContainer.appendChild(img);
            imgContainer.appendChild(titleOverlay);
            gridContainer.appendChild(imgContainer);

            // Add click handler for popup instead of direct link
            imgContainer.addEventListener("click", (e) => {
                e.preventDefault();
                const currentIndex = screenshots.findIndex(s => s.title === title);
                const currentTrackName = trackSelector.options[trackSelector.selectedIndex].text;
                openScreenshotModal(screenshots, currentIndex, trackNum, episodeTitle, currentTrackName);
            });

            // Add hover effect
            imgContainer.addEventListener("mouseenter", () => {
                imgContainer.style.boxShadow = "0 4px 8px rgba(0,0,0,0.2)";
                titleOverlay.style.opacity = "1";
            });

            imgContainer.addEventListener("mouseleave", () => {
                imgContainer.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
                titleOverlay.style.opacity = "0";
            });
        });
    }

    // Add track options from subtitles
    if (subtitles) {
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

    // Add chevron icon
    const icon = document.createElement("i");
    icon.className = "fa-solid fa-chevron-down";
    icon.style.transition = "transform 0.2s";
    icon.style.marginLeft = "10px";
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
    // Insert screenshots panel after the torrent-description panel
    const torrentDescription = document.querySelector("#torrent-description");
    if (torrentDescription) {
        const parentPanel = torrentDescription.closest(".panel.panel-default");
        if (parentPanel) {
            parentPanel.parentNode.insertBefore(screenshotsPanel, parentPanel.nextSibling);
        }
    }
}

async function getValidHighlighterStyle(styleName) {
    const url = `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/${styleName}.css`;
    try {
        const resp = await fetch(url, { method: 'HEAD' });
        if (resp.ok) return styleName;
    } catch { }
    return 'atom-one-dark';
}

// Utility: Extract filename from URL (including query params if present)
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

function addSubtitlesToTorrentList(subtitles, isFilteredInit) {
    // Remove existing attachments panel if it exists
    const allPanels = document.querySelectorAll('.panel.panel-default');
    let refreshPanel = false;
    let wasCollapsed = false;
    allPanels.forEach(panel => {
        const title = panel.querySelector('.panel-title');
        if (title && title.textContent.includes('Attachments')) {
            panel.remove();
            refreshPanel = true;
            const body = panel.querySelector('.panel-body');
            if (body.style.display === 'none') {
                wasCollapsed = true;
            }
        }
    });

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
    attachmentsPanel.className = "panel panel-default";
    const heading = document.createElement("div");
    heading.className = "panel-heading";
    heading.style.display = "flex";
    heading.style.alignItems = "center";
    heading.style.padding = "10px 15px";

    // Create a container for the title and filter button
    const leftSection = document.createElement("div");
    leftSection.style.display = "flex";
    leftSection.style.alignItems = "center";
    leftSection.style.flexGrow = "1";

    const title = document.createElement("h3");
    title.className = "panel-title";
    title.textContent = "Attachments";
    title.style.margin = "0";
    title.style.fontSize = "16px";
    title.style.fontWeight = "500";

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
                const isAssFile = /\.ass(\.xz)?$/i.test(link);
                const isSrtFile = /\.srt(\.xz)?$/i.test(link);
                const isPgsFile = /\.sup(\.xz)?$/i.test(link);
                const isHighlightableFile = isAssFile || isSrtFile;

                // Detect if this is a middle click or ctrl+click (open in new tab without focus)
                const isMiddleClick = e.button === 1;
                const isCtrlClick = e.ctrlKey || e.metaKey;
                const shouldOpenWithoutFocus = isMiddleClick || isCtrlClick;

                try {
                    // Fetch the subtitle file as a stream
                    const response = await fetch(link);
                    if (!response.ok) throw new Error('Failed to fetch subtitle');
                    const responseClone = response.clone();
                    // Decompress using xz-decompress streaming API
                    const XzReadableStream = window['xz-decompress']?.XzReadableStream;
                    if (!XzReadableStream) throw new Error('XZ decompressor not found');
                    // Create XZ decompression stream directly from the response body
                    const decompressedStream = new XzReadableStream(response.body);
                    // Create a Response object to easily get the text
                    const decompressedResponse = new Response(decompressedStream);
                    // Get the decompressed text
                    const decompressedText = await decompressedResponse.text();
                    // Store the original response blob for reuse
                    const originalSubtitleBlob = await responseClone.blob();
                    // Get the filename from the URL
                    const fileName = getFileNameFromUrl(link).replace(/</g, '&lt;');
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
                                // Set the original link and filename from embedded data
                                (function() {
                                    let originalBlob = null;
                                    let fileName = '${fileName.replace(/'/g, "\\'")}';
                                    let fileUrl = '${link.replace(/'/g, "\\'")}';

                                    // Try to get data from opener as fallback
                                    try {
                                        if (window.opener && window.opener._nyat_subtitle_url) {
                                            fileUrl = window.opener._nyat_subtitle_url;
                                            if (window.opener._nyat_subtitle_blob) {
                                                originalBlob = window.opener._nyat_subtitle_blob;
                                            }
                                            if (window.opener._nyat_subtitle_filename) {
                                                fileName = window.opener._nyat_subtitle_filename;
                                            }
                                        }
                                    } catch {}

                                    // Set the filename in the title bar, removing .xz extension if present
                                    let displayName = fileName.replace(/\.xz$/i, '') || 'subtitle';
                                    document.getElementById('nyat-filename').textContent = displayName;
                                    document.getElementById('nyat-original-link').value = fileUrl;
                                    // Store the blob for download
                                    window._nyat_subtitle_blob = originalBlob;
                                    window._nyat_subtitle_filename = fileName;
                                })();
                                // Download original .xz file
                                document.getElementById('download-xz').onclick = async function() {
                                    const fileUrl = document.getElementById('nyat-original-link').value;
                                    let blob = window._nyat_subtitle_blob;
                                    if (!blob) {
                                        // fallback: fetch if not available (should not happen)
                                        try {
                                            const resp = await fetch(fileUrl);
                                            if (!resp.ok) throw new Error('Failed to fetch original file');
                                            blob = await resp.blob();
                                        } catch (err) {
                                            alert('Download failed: ' + err.message);
                                            return;
                                        }
                                    }
                                    const a = document.createElement('a');
                                    a.href = URL.createObjectURL(blob);
                                    a.download = window._nyat_subtitle_filename || 'subtitle.xz';
                                    document.body.appendChild(a);
                                    a.click();
                                    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
                                    document.body.removeChild(a);
                                };
                                // Download extracted subtitle
                                document.getElementById('download-extracted').onclick = function() {
                                    const fileUrl = document.getElementById('nyat-original-link').value;
                                    let baseName = (window._nyat_subtitle_filename || 'subtitle').replace(/\.xz$/i, '');
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
                        let win = window.open(url, '_blank')
                        if (win) {
                            // Try to pass via window.opener for other browsers
                            try {
                                win._nyat_subtitle_url = link;
                                win._nyat_subtitle_blob = originalSubtitleBlob;
                                win._nyat_subtitle_filename = fileName;
                            } catch { }
                        }
                    }
                } catch (err) {
                    alert('Failed to view subtitle: ' + err.message);
                }
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
                        // Fetch the subtitle file as a stream
                        const response = await fetch(link);
                        if (!response.ok) throw new Error('Failed to fetch subtitle');
                        const responseClone = response.clone();
                        // Decompress using xz-decompress streaming API
                        const XzReadableStream = window['xz-decompress']?.XzReadableStream;
                        if (!XzReadableStream) throw new Error('XZ decompressor not found');
                        // Create XZ decompression stream directly from the response body
                        const decompressedStream = new XzReadableStream(response.body);
                        // Create a Response object to easily get the text
                        const decompressedResponse = new Response(decompressedStream);
                        // Get the decompressed text
                        const decompressedText = await decompressedResponse.text();
                        // Download extracted subtitle
                        let baseName = (function () {
                            try {
                                const u = new URL(link);
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

    // Add left section and chevron to heading
    heading.appendChild(leftSection);

    // Add chevron icon
    const icon = document.createElement("i");
    icon.className = "fa-solid fa-chevron-down";
    icon.style.transition = "transform 0.2s";
    icon.style.marginLeft = "10px";
    heading.appendChild(icon);

    attachmentsPanel.appendChild(heading);
    attachmentsPanel.appendChild(body);

    // Insert attachments panel before the main panel
    panel.parentNode.insertBefore(attachmentsPanel, panel);

    // Make attachments panel collapsible
    if (refreshPanel) {
        makePanelCollapsible(attachmentsPanel, wasCollapsed);
    } else {
        makePanelCollapsible(attachmentsPanel, settings.attachments === "hide");
    }

    // **Call updateFilter once here to respect filtersByDefault on initial load**
    updateFilter();
}

async function doFeatures() {
    // Make the file list panel collapsible
    const fileListPanel = document.querySelector(".panel.panel-default > .torrent-file-list.panel-body");
    if (fileListPanel) {
        const panel = fileListPanel.closest(".panel.panel-default");
        if (panel) {
            makePanelCollapsible(panel);
        }
    }

    const hash = document.querySelector("body > div.container div.panel-body div.col-md-5 > kbd")?.textContent;

    const tosho = await fetchUrl(`https://feed.animetosho.org/json?show=torrent&btih=${hash}`);
    // Sort files by filename if they exist
    if (tosho.files) {
        tosho.files.sort((a, b) => a.filename.localeCompare(b.filename));
    }
    console.log(tosho)
    const magnet = document.querySelector("div > a.card-footer-item");

    const parent = magnet?.parentElement;

    let linkMap = null

    let toshoViewPageUrl = "";
    if (tosho.nyaa_id || tosho.anidex_id || tosho.tosho_id) {
        toshoViewPageUrl = 'https://animetosho.org/view/';
        if (tosho.nyaa_id)
            toshoViewPageUrl += `.n${tosho.nyaa_id}`;
        else if (tosho.anidex_id)
            toshoViewPageUrl += `.d${tosho.anidex_id}`;
        else if (tosho.tosho_id)
            toshoViewPageUrl += `${tosho.tosho_id}`;
    }

    let selectedEpId = null;
    let selectedEpFilename = null; // Without folder name
    let countVidFiles = 0;
    if (tosho.files) {
        for (const file of tosho.files) {
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

    function makeFileListClickable(countVidFiles, selectedEpId, tosho) {
        if (countVidFiles <= 1) return;
        if (!tosho.files) return;

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
        for (const file of tosho.files) {
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
            if (file.id === selectedEpId) {
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



    // Anidb
    if (tosho.anidb_aid && settings.anidb) {
        let text = document.createTextNode(" or ")
        parent?.appendChild(text)

        let anidbUrl = `https://anidb.net/anime/${tosho.anidb_aid}`;

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
            linkMap.mal = `https://myanimelist.net/anime/${out_response.results[0].mal_id}`;
            linkMap.anilist = `https://anilist.co/anime/${out_response.results[0].anilist_id}`;
        } else if (anidbConnectingAPI == 'animeapi') {
            linkMap.mal = `https://myanimelist.net/anime/${out_response.myanimelist}`;
            linkMap.anilist = `https://anilist.co/anime/${out_response.anilist}`;
        }

        return linkMap;
    }

    let anidbConnectingAPI = 'plexanibridge' // or 'animeapi'

    // MyAnimeList
    const mal = magnet?.cloneNode(true);
    mal.href = `https://myanimelist.net/anime/0`
    if (tosho.anidb_aid && settings.myanimelist) {
        let text = document.createTextNode(" or ")
        parent?.appendChild(text)

        mal.querySelector("i").remove()
        mal.innerHTML = '<i class="fa-solid fa-database fa-fw"></i>MyAnimeList'

        async function openMal(e, linkMap, mal) {
            if (!linkMap) {
                linkMap = await fetchAnidbLinkMap(tosho.anidb_aid, anidbConnectingAPI);
                mal.href = linkMap.mal
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
    if (tosho.anidb_aid && settings.anilist) {
        let text = document.createTextNode(" or ")
        parent?.appendChild(text)

        anilist.querySelector("i").remove()
        anilist.innerHTML = '<i class="fa-solid fa-database fa-fw"></i>AniList'

        async function openAnilist(e, linkMap, anilist) {
            if (!linkMap) {
                linkMap = await fetchAnidbLinkMap(tosho.anidb_aid, anidbConnectingAPI);
                anilist.href = linkMap.anilist
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
        if (tosho.status == "skipped") {
            animetosho.innerHTML = '<i class="fa-solid fa-at fa-fw"></i>AnimeTosho (Skipped)';
        } else if (tosho.status == "processing") {
            animetosho.innerHTML = '<i class="fa-solid fa-at fa-fw"></i>AnimeTosho (Processing)';
        } else {
            animetosho.innerHTML = '<i class="fa-solid fa-at fa-fw"></i>AnimeTosho';
        }
        animetosho.href = toshoViewPageUrl
        animetosho.onclick = function () {
            window.open(toshoViewPageUrl, '_blank').focus();
            return false
        };
        parent?.appendChild(animetosho);
    }

    // NZB
    if ("nzb_url" in tosho && tosho.nzb_url && settings.nzb) {
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
                    url: `${settings.sabUrl}api?mode=addurl&name=${encodeURIComponent(tosho.nzb_url)}&apikey=${settings.nzbKey}`,
                    timeout: 5000
                })
                return false
            };
            nzb_sab.href = tosho.nzb_url
            parent?.appendChild(nzb_sab);

        } else {
            const nzb = magnet?.cloneNode(true);

            nzb.querySelector("i").remove()
            // Juice box svg but is inconsistent
            //nzb.innerHTML = '<svg id="Capa_1" width="16" height="16" style="vertical-align: -0.15em; margin-right: 2px" enable-background="new 0 0 512 512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><g><path d="m142.834 106.016v-106.016h-83.155v30h53.156v76.016h-68.156v405.984h422.643v-405.984zm171.679 375.984h-239.834v-345.984h239.834zm102.511-345.984-26.107 27.08-26.107-27.08zm-72.511 345.984v-323.813l46.404 48.133 46.404-48.133v323.813z" fill="#000000" style="fill: rgb(65, 125, 198);"></path><path d="m194.596 423.212c45.956 0 83.344-37.388 83.344-83.344 0-24.917-11.005-47.299-28.393-62.584 2.441-1.601 4.771-3.449 6.926-5.604 21.311-21.311 13.76-59.174 12.829-63.421l-2.057-9.383-9.383-2.058c-4.247-.93-42.111-8.482-63.422 12.83-13.685 13.685-15.464 34.185-14.741 48.236-38.869 7.047-68.446 41.114-68.446 81.984-.001 45.956 37.387 83.344 83.343 83.344zm21.057-192.351c5.334-5.334 16.46-6.401 25.567-5.964.438 9.113-.63 20.238-5.961 25.569-5.334 5.334-16.463 6.4-25.567 5.964-.439-9.113.63-20.238 5.961-25.569zm-21.057 55.663c29.414 0 53.344 23.93 53.344 53.344s-23.93 53.344-53.344 53.344-53.344-23.93-53.344-53.344 23.93-53.344 53.344-53.344z" fill="#000000" style="fill: rgb(65, 125, 198);"></path></g></svg>NZB'
            nzb.innerHTML = '<i class="fa-solid fa-box fa-fw"></i>NZB'
            nzb.href = tosho.nzb_url
            parent?.appendChild(nzb);
        }
    }

    if (countVidFiles > 1) {
        window.toshoHtml = await fetchUrl(toshoViewPageUrl);
    }

    async function doDynamicEpisodeFunctions(selectedEpId, selectedEpFilename, countVidFiles) {

        // Tosho fetches
        let selectedEpHtml = null;

        selectedEpHtml = await fetchUrl(`https://animetosho.org/file/${selectedEpId}`);


        // Fileinfo
        let fileInfo = null;
        if (selectedEpId) {
            fileInfo = await extractFileinfoFromHtml(selectedEpHtml);
            // console.log(fileInfo)
            if (fileInfo && settings.fileinfo) {
                let mediainfo = document.querySelector('a[href="#"]:has(i.fa-file)');
                if (!mediainfo) {
                    let text = document.createTextNode(" or ");
                    parent?.appendChild(text);

                    mediainfo = magnet?.cloneNode(true);
                    mediainfo.querySelector("i").remove();
                    mediainfo.innerHTML = '<i class="fa-solid fa-file fa-fw"></i>Fileinfo';
                    mediainfo.href = "#";
                }

                function openMediainfo(e) {
                    if (e) e.preventDefault();
                    // Try to get the filename for the title
                    let fileTitle = selectedEpFilename || 'Fileinfo';
                    const htmlContent = `
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <title>${fileTitle.replace(/</g, '&lt;')}</title>
                            <style>
                                body {
                                    background-color: #121212;
                                    color: #ffffff;
                                    font-family: Arial, sans-serif;
                                    padding: 0px;
                                }
                                pre {
                                    white-space: pre-wrap;
                                    word-wrap: break-word;
                                }
                            </style>
                        </head>
                        <body>
                            <pre>${fileInfo}</pre>
                        </body>
                        </html>
                    `;
                    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
                    const url = URL.createObjectURL(blob);

                    const isMiddleClick = e && e.button === 1;
                    const isCtrlClick = e && (e.ctrlKey || e.metaKey);
                    const shouldOpenWithoutFocus = isMiddleClick || isCtrlClick;
                    const ua = navigator.userAgent.toLowerCase();
                    const isFirefox = ua.includes('firefox');

                    if (shouldOpenWithoutFocus) {
                        if (isFirefox) {
                            window.open(url, '_blank', 'noopener,noreferrer');
                        } else {
                            const win = window.open(url, '_blank', 'noopener,noreferrer');
                            if (win) {
                                try { win.blur(); } catch { }
                                try { window.focus(); } catch { }
                                setTimeout(() => {
                                    try { win.blur(); } catch { }
                                    try { window.focus(); } catch { }
                                }, 0);
                            }
                        }
                    } else {
                        window.open(url, '_blank');
                    }
                    return false;
                }

                mediainfo.onclick = openMediainfo;
                if (mediainfo._auxClickHandler) {
                    mediainfo.removeEventListener('auxclick', mediainfo._auxClickHandler);
                }
                mediainfo._auxClickHandler = function (e) { if (e.button === 1) openMediainfo(e); };
                mediainfo.addEventListener('auxclick', mediainfo._auxClickHandler);

                parent?.appendChild(mediainfo);
            }

        }


        let subtitles = [];

        // Attachments
        if (selectedEpId && toshoViewPageUrl) {
            // Likely batch release so get the track attachments from first episode
            if (countVidFiles > 1) {
                subtitles = extractSubtitlesFromHtml(window.toshoHtml);
                // Check that it is a batch release
                if (subtitles.length == 1 && subtitles[0].text == "All Attachments") {
                    subtitles[0].text = "All Attachments (Batch)";
                }
            }

            // Get the track attachments from first episode
            const selectedEpSubtitles = extractSubtitlesFromHtml(selectedEpHtml);
            if (countVidFiles > 1) {
                subtitles = [...subtitles, ...selectedEpSubtitles.slice(1)];
            } else {
                subtitles = selectedEpSubtitles;
            }

            if (settings.attachments !== "no" && subtitles.length > 0) {
                addSubtitlesToTorrentList(subtitles, settings.filtersByDefault);
            }
        }

        // Screenshots
        if (toshoViewPageUrl && settings.screenshots !== "no") {
            let screenshots = [];
            if (selectedEpHtml) {
                screenshots = extractScreenshotsFromHtml(selectedEpHtml);
            } else if (toshoHtml) {
                screenshots = extractScreenshotsFromHtml(toshoHtml);
            }
            addScreenshotsToPage(screenshots, fileInfo, subtitles, selectedEpFilename);
        }
    }

    doDynamicEpisodeFunctions(selectedEpId, selectedEpFilename, countVidFiles, toshoViewPageUrl);
    makeFileListClickable(countVidFiles, selectedEpId, tosho);

    // Delayed fetch so that the other ones are available faster
    if (settings.anilist || settings.myanimelist) {
        if (!linkMap) linkMap = await fetchAnidbLinkMap(tosho.anidb_aid, anidbConnectingAPI);
        anilist.href = linkMap.anilist;
        mal.href = linkMap.mal;
    }
}

async function doSettings() {
    function mergeSettings(defaultSettings, userSettings) {
        const mergedSettings = { ...defaultSettings };

        // Preserve user-defined values
        for (const key in userSettings) {
            if (key in defaultSettings) {
                mergedSettings[key] = userSettings[key];
            }
        }

        return mergedSettings;
    }

    // Load settings or initialize with defaults
    const userSettings = await GM.getValue("settings", {});
    settings = mergeSettings(defaultSettings, userSettings);

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
            const el = document.getElementById(`setting-${key}`);
            if (!el) return;
            if (key === "highlighterStyle") {
                updatedSettings[key] = el.value.trim();
            } else if (key === "highlighterCharCap") {
                updatedSettings[key] = parseInt(el.value, 10) || 100000;
            } else if (typeof settings[key] === "boolean") {
                updatedSettings[key] = el.checked;
            } else if (Array.isArray(settings[key])) {
                updatedSettings[key] = el.value.split(",").map(s => s.trim());
            } else {
                updatedSettings[key] = el.value;
            }
        });
        await GM.setValue("settings", updatedSettings);
        closeSettingsUI();
        location.reload(); // Reload page to reflect changes
    }

    // Close settings UI
    function closeSettingsUI() {
        const settingsUI = document.getElementById("settings-ui");
        if (settingsUI) settingsUI.remove();
    }

    // Show settings UI
    async function showSettingsUI() {
        const existingUI = document.getElementById("settings-ui");
        if (existingUI) {
            existingUI.remove();
            return;
        }

        // Create UI container
        const settingsUI = document.createElement("div");
        settingsUI.id = "settings-ui";
        settingsUI.style.position = "fixed";
        settingsUI.style.top = "10px";
        settingsUI.style.right = "10px";
        settingsUI.style.width = "360px";
        settingsUI.style.backgroundColor = "#333";
        settingsUI.style.border = "2px solid #ccc";
        settingsUI.style.borderRadius = "10px";
        settingsUI.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.2)";
        settingsUI.style.padding = "15px";
        settingsUI.style.fontFamily = "Arial, sans-serif";
        settingsUI.style.zIndex = "1000";

        // Generate HTML content for settings
        settingsUI.innerHTML = `
            <style>
                #settings-ui {
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    left: auto;
                    bottom: auto;
                    width: 360px;
                    max-width: 95vw;
                    max-height: 90vh;
                    overflow: auto;
                    background-color: #333;
                    border: 2px solid #ccc;
                    border-radius: 10px;
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                    padding: 15px;
                    font-family: Arial, sans-serif;
                    z-index: 1000;
                }
                #settings-ui .settings-header {
                    margin-top: 0;
                    text-align: center;
                    color: #ffffff;
                    font-size: 19px;
                    font-weight: 600;
                    letter-spacing: 0.5px;
                    margin-bottom: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                }
                #settings-ui .settings-header i {
                    font-size: 18px;
                    margin-left: 4px;
                }
                #settings-ui label {
                    display: flex;
                    align-items: center;
                    margin-bottom: 8px;
                    color: #ffffff;
                    font-size: 14px;
                }
                #settings-ui label > span {
                    display: inline-block;
                    width: 150px;
                    font-weight: bold;
                    margin: 0;
                }
                #settings-ui input[type="text"],
                #settings-ui select,
                #settings-ui textarea {
                    width: 160px;
                    box-sizing: border-box;
                    color: #333;
                    padding: 5px;
                    border: 1px solid #ccc;
                    border-radius: 5px;
                    font-family: inherit;
                    font-size: inherit;
                    background-color: #fff;
                    margin: 0;
                }
                #settings-ui input[type="checkbox"] {
                    margin: 0 0 0 0;
                }
                .settings-group {
                    border: 1px solid #444;
                    border-radius: 8px;
                    margin-bottom: 18px;
                    padding: 10px 10px 10px 18px;
                    background: #232323;
                }
                .settings-group-label {
                    font-weight: bold;
                    color: #b0e0ff;
                    margin-bottom: 6px;
                    margin-left: -8px;
                    font-size: 15px;
                }
                .settings-nested {
                    margin-left: 24px;
                }
            </style>
            <div class="settings-header">Nyaa-AnimeTosho Extender <i class="fa fa-cog" aria-hidden="true"></i></div>
            <div style="margin-bottom: 10px;">
                <label><span>settingsPosition</span><select id="setting-settingsPosition">
                    <option value="navbar" ${settings.settingsPosition === 'navbar' ? 'selected' : ''}>Navbar</option>
                    <option value="user dropdown" ${settings.settingsPosition === 'user dropdown' ? 'selected' : ''}>User dropdown</option>
                </select></label>
                ${Object.keys(settings)
                .filter(key => ['anidb', 'myanimelist', 'anilist', 'animetosho', 'fileinfo'].includes(key))
                .map(key => {
                    let inputHtml = '';
                    if (typeof settings[key] === "boolean") {
                        inputHtml = `<input type="checkbox" id="setting-${key}" ${settings[key] ? "checked" : ""} style="transform: scale(1.2);">`;
                    } else if (Array.isArray(settings[key])) {
                        inputHtml = `<textarea id="setting-${key}">${settings[key].join(",")}</textarea>`;
                    } else {
                        inputHtml = `<input type="text" id="setting-${key}" value="${settings[key]}">`;
                    }
                    return `<label><span>${key}:</span>${inputHtml}</label>`;
                }).join("")}

                <div id="setting-nzb-group">
                <label><span>nzb:</span><input type="checkbox" id="setting-nzb" ${settings.nzb ? "checked" : ""} style="transform: scale(1.2);"></label>
                <label id="setting-sabUrl-row" style="${settings.nzb ? '' : 'display:none;'}"><span>sabUrl:</span><input type="text" id="setting-sabUrl" value="${settings.sabUrl}"></label>
                <label id="setting-nzbKey-row" style="${settings.nzb ? '' : 'display:none;'}"><span>nzbKey:</span><input type="text" id="setting-nzbKey" value="${settings.nzbKey}"></label>
                <hr style="border: 0; border-top: 1px solid #555; margin: 15px 0;">
                </div>

                <div id="setting-screenshots-group">
                <label><span>screenshots:</span><select id="setting-screenshots">
                        <option value="no" ${settings.screenshots === "no" ? "selected" : ""}>No</option>
                        <option value="hide" ${settings.screenshots === "hide" ? "selected" : ""}>Hide</option>
                        <option value="show" ${settings.screenshots === "show" ? "selected" : ""}>Show</option>
                    </select></label>
                <label id="setting-previewSize-row" style="${settings.screenshots !== 'no' ? '' : 'display:none;'}"><span>previewSize:</span><select id="setting-previewSize">
                        <option value="compact" ${settings.previewSize === "compact" ? "selected" : ""}>Compact</option>
                        <option value="medium" ${settings.previewSize === "medium" ? "selected" : ""}>Medium</option>
                        <option value="large" ${settings.previewSize === "large" ? "selected" : ""}>Large</option>
                        <option value="huge" ${settings.previewSize === "huge" ? "selected" : ""}>Huge</option>
                    </select></label>
                <label id="setting-subsByDefault-row" style="${settings.screenshots !== 'no' ? '' : 'display:none;'}"><span>subsByDefault:</span><select id="setting-subsByDefault">
                    <option value="no" ${settings.subsByDefault === "no" ? "selected" : ""}>No Subtitles</option>
                    <option value="first" ${settings.subsByDefault === "first" ? "selected" : ""}>First Track</option>
                    <option value="first-nonforced" ${settings.subsByDefault === "first-nonforced" ? "selected" : ""}>First Non-Forced</option>
                </select></label>
                <hr style="border: 0; border-top: 1px solid #555; margin: 15px 0;">
                </div>

                <div id="setting-attachments-group">
                <label><span>attachments:</span><select id="setting-attachments">
                        <option value="no" ${settings.attachments === "no" ? "selected" : ""}>No</option>
                        <option value="hide" ${settings.attachments === "hide" ? "selected" : ""}>Hide</option>
                        <option value="show" ${settings.attachments === "show" ? "selected" : ""}>Show</option>
                    </select></label>
                <label id="setting-attachmentAction-row" style="${settings.attachments !== 'no' ? '' : 'display:none;'}"><span>attachmentAction</span><select id="setting-attachmentAction">
                    <option value="view" ${settings.attachmentAction === 'view' ? 'selected' : ''}>View</option>
                    <option value="download" ${settings.attachmentAction === 'download' ? 'selected' : ''}>Download</option>
                    <option value="download extracted" ${settings.attachmentAction === 'download extracted' ? 'selected' : ''}>Download Extracted</option>
                </select></label>
                <label id="setting-highlighterStyle-row" style="${settings.attachments !== 'no' && settings.attachmentAction === 'view' ? '' : 'display:none;'}"><span>highlighterStyle:</span><textarea id="setting-highlighterStyle" rows="1" style="resize: none; overflow: hidden; min-height: 30px; max-height: 30px; white-space: nowrap;">${settings.highlighterStyle}</textarea></label>
                <label id="setting-highlighterCharCap-row" style="${settings.attachments !== 'no' && settings.attachmentAction === 'view' ? '' : 'display:none;'}"><span>highlighterCharCap:</span><input type="number" id="setting-highlighterCharCap" value="${settings.highlighterCharCap}" min="0" step="10000" style="width: 160px; box-sizing: border-box; color: #333; padding: 5px; border: 1px solid #ccc; border-radius: 5px; font-family: inherit; font-size: inherit; background-color: #fff; margin: 0;"></label>
                <label id="setting-filtersByDefault-row" style="${settings.attachments !== 'no' ? '' : 'display:none;'}"><span>filtersByDefault:</span><input type="checkbox" id="setting-filtersByDefault" ${settings.filtersByDefault ? "checked" : ""} style="transform: scale(1.2);"></label>
                <label id="setting-languageFilters-row" style="${settings.attachments !== 'no' ? '' : 'display:none;'}"><span>languageFilters:</span><textarea id="setting-languageFilters" rows="1" style="resize: none; overflow: hidden; max-height: 60px;">${Array.isArray(settings.languageFilters) ? settings.languageFilters.join(",") : settings.languageFilters}</textarea></label>
                <hr style="border: 0; border-top: 1px solid #555; margin: 15px 0;">
                </div>

                <!-- The rest of the settings go here, as before -->
            </div>
            <div style="text-align: center; margin-top: 15px;">
                <button
                    id="save-settings"
                    style="padding: 8px 15px;
                           background-color: #4CAF50;
                           color: #fff;
                           border: none;
                           border-radius: 5px;
                           cursor: pointer;
                           transition: all 0.15s ease-in-out;">
                    Save
                </button>
                <button
                    id="close-settings"
                    style="padding: 8px 15px;
                           background-color: #f44336;
                           color: #fff;
                           border: none;
                           border-radius: 5px;
                           cursor: pointer;
                           margin-left: 10px;
                           transition: all 0.15s ease-in-out;">
                    Close
                </button>
            </div>
        `;

        // Add dynamic show/hide logic for dependent settings
        settingsUI.querySelector('#setting-nzb').addEventListener('change', function () {
            const show = this.checked;
            settingsUI.querySelector('#setting-sabUrl-row').style.display = show ? '' : 'none';
            settingsUI.querySelector('#setting-nzbKey-row').style.display = show ? '' : 'none';
        });
        settingsUI.querySelector('#setting-screenshots').addEventListener('change', function () {
            const show = this.value !== 'no';
            settingsUI.querySelector('#setting-previewSize-row').style.display = show ? '' : 'none';
            settingsUI.querySelector('#setting-subsByDefault-row').style.display = show ? '' : 'none';
        });
        settingsUI.querySelector('#setting-attachments').addEventListener('change', function () {
            const show = this.value !== 'no';
            settingsUI.querySelector('#setting-filtersByDefault-row').style.display = show ? '' : 'none';
            settingsUI.querySelector('#setting-attachmentAction-row').style.display = show ? '' : 'none';
            const attachmentAction = settingsUI.querySelector('#setting-attachmentAction').value;
            settingsUI.querySelector('#setting-highlighterStyle-row').style.display = show && attachmentAction === 'view' ? '' : 'none';
            settingsUI.querySelector('#setting-highlighterCharCap-row').style.display = show && attachmentAction === 'view' ? '' : 'none';
            settingsUI.querySelector('#setting-languageFilters-row').style.display = show ? '' : 'none';
            // Auto-expand the languageFilters textarea if shown
            if (show) {
                const textarea = settingsUI.querySelector('#setting-languageFilters');
                if (textarea) {
                    textarea.style.height = 'auto';
                    textarea.style.height = textarea.scrollHeight + 'px';
                }
            }
        });
        settingsUI.querySelector('#setting-attachmentAction').addEventListener('change', function () {
            const show = settingsUI.querySelector('#setting-attachments').value !== 'no' && this.value === 'view';
            settingsUI.querySelector('#setting-highlighterStyle-row').style.display = show ? '' : 'none';
            settingsUI.querySelector('#setting-highlighterCharCap-row').style.display = show ? '' : 'none';
        });

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

        // Button color schemes
        const buttonColors = {
            save: {
                normal: { bg: "#4CAF50", hover: "#45a049" },
                text: "#fff"
            },
            close: {
                normal: { bg: "#f44336", hover: "#da190b" },
                text: "#fff"
            }
        };

        // Function to add hover effects to buttons
        function addButtonHoverEffects(buttonId, colorScheme) {
            const button = document.getElementById(buttonId);
            if (!button) return;

            button.addEventListener("mouseenter", () => {
                button.style.backgroundColor = colorScheme.hover;
                button.style.transform = "translateY(-1px)";
                button.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
            });

            button.addEventListener("mouseleave", () => {
                button.style.backgroundColor = colorScheme.normal;
                button.style.transform = "translateY(0)";
                button.style.boxShadow = "none";
            });

            button.addEventListener("mousedown", () => {
                button.style.transform = "translateY(1px)";
            });

            button.addEventListener("mouseup", () => {
                button.style.transform = "translateY(-1px)";
            });
        }

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

        // Apply hover effects to buttons
        addButtonHoverEffects('save-settings', buttonColors.save);
        addButtonHoverEffects('close-settings', buttonColors.close);

        // Apply auto-expand functionality to textareas
        addTextareaAutoExpand();

        // Add event listeners for buttons
        document.getElementById("save-settings").addEventListener("click", saveSettings);
        document.getElementById("close-settings").addEventListener("click", closeSettingsUI);
        // Add Enter key to save settings (except in textarea or select)
        settingsUI.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && document.activeElement && document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'SELECT') {
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
