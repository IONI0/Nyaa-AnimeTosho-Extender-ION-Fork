// ==UserScript==
// @name         Nyaa AnimeTosho Extender ION Fork
// @version      0.61-11
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
// @match        https://nyaa.si/view/*
// @run-at       document-end
// ==/UserScript==


// Jimbo's work with some additional features and tweaks (apologies for ai code, I don't know js or html)

const defaultSettings = {
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
    subsByDefault: "first", // "no", "first"
    attachments: "show", // "no", "hide", or "show"
    filtersByDefault: false,
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

async function fetchSubtitlesSection(url) {
    try {
        const html = await fetchUrl(url);
        // console.log(html)

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
        console.error("Error fetching or parsing subtitles:", error);
        return [];
    }
}

function makePanelCollapsible(panel, startCollapsed = false) {
    const heading = panel.querySelector('.panel-heading');
    if (!heading) return;

    heading.style.cursor = "pointer";
    heading.style.display = "flex";
    heading.style.alignItems = "center";
    heading.style.padding = "10px 15px";

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
    if (startCollapsed) {
        body.style.display = "none";
        const icon = heading.querySelector('i.fa-chevron-down');
        if (icon) {
            icon.style.transform = "rotate(-90deg)";
        }
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
    });
}

async function fetchScreenshots(url) {
    try {
        const html = await fetchUrl(url);

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
                const storageUrl = linkMatch[1].replace(/\/view\/sframes\//, '/storage/sframes/');
                const thumbnailUrl = linkMatch[3].replace(/\/view\/sframes\//, '/storage/sframes/');

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
        console.error("Error fetching screenshots:", error);
        return [];
    }
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

    // Create loading indicator
    const loadingIndicator = document.createElement('div');
    loadingIndicator.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: white;
        font-size: 18px;
        z-index: 10001;
    `;
    loadingIndicator.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';

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
        const baseUrl = screenshot.url.split('?')[0];
        const fullUrl = trackNum ? `${baseUrl}?s=${trackNum}` : baseUrl;

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
        loadingIndicator.style.display = 'none';

        // Only start preloading after current image is fully loaded
        modalImage.onload = () => {
            // Preload adjacent images in background
            const prevIndex = currentIndex === 0 ? screenshots.length - 1 : currentIndex - 1;
            const nextIndex = currentIndex === screenshots.length - 1 ? 0 : currentIndex + 1;

            if (screenshots.length > 1) {
                const prevUrl = trackNum ? `${screenshots[prevIndex].url.split('?')[0]}?s=${trackNum}` : screenshots[prevIndex].url.split('?')[0];
                const nextUrl = trackNum ? `${screenshots[nextIndex].url.split('?')[0]}?s=${trackNum}` : screenshots[nextIndex].url.split('?')[0];

                // Preload silently
                preloadImage(prevUrl).catch(() => {});
                preloadImage(nextUrl).catch(() => {});
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
            switch(e.key) {
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
    modalOverlay.remove = function() {
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

    imageContainer.appendChild(loadingIndicator);
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

function addScreenshotsToPage(screenshots, subtitles, episodeTitle) {
    if (!screenshots.length || settings.screenshots === "no") return;

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
    trackSelector.style.border = "1px solid #444";
    trackSelector.style.borderRadius = "3px";
    trackSelector.style.backgroundColor = "#6e757c";
    trackSelector.style.color = "#fff";
    trackSelector.style.cursor = "pointer";
    trackSelector.style.height = "24px"; // Match filter button height

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
    switch(settings.previewSize) {
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
                grid-template-columns: repeat(${
                    settings.previewSize === "compact" ? "5" :
                    settings.previewSize === "medium" ? "3" :
                    settings.previewSize === "large" ? "2" :
                    "1"
                }, 1fr) !important;
            }
        }
        @media (max-width: 600px) {
            .screenshot-grid {
                grid-template-columns: repeat(${
                    settings.previewSize === "compact" ? "3" :
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

        screenshots.forEach(({ url, thumbnail, title }) => {
            const imgContainer = document.createElement("div");
            imgContainer.style.position = "relative";
            imgContainer.style.width = "100%";
            imgContainer.style.paddingBottom = "56.25%"; // Default 16:9 aspect ratio
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
            const baseUrl = thumbnail.split('?')[0];
            const fullBaseUrl = url.split('?')[0];
            // Only add track parameter if a track is selected
            img.src = trackNum ? `${baseUrl}?s=${trackNum}` : baseUrl;
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
    if (settings.subsByDefault === "first" && trackSelector.options.length > 1) {
        trackSelector.selectedIndex = 1; // Select first track (index 0 is "No Track")
        updateScreenshots(trackSelector.value);
    } else {
        trackSelector.selectedIndex = 0; // Select "No Track"
        updateScreenshots("");
    }

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
    makePanelCollapsible(screenshotsPanel, settings.screenshots === "hide");

    // Insert screenshots panel after the torrent-description panel
    const torrentDescription = document.querySelector("#torrent-description");
    if (torrentDescription) {
        const parentPanel = torrentDescription.closest(".panel.panel-default");
        if (parentPanel) {
            parentPanel.parentNode.insertBefore(screenshotsPanel, parentPanel.nextSibling);
        }
    }
}

function addSubtitlesToTorrentList(subtitles, isFiltered) {
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

    const toggleButton = document.createElement("button");
    toggleButton.textContent = isFiltered ? "Filter ON" : "Filter OFF";
    toggleButton.className = "btn btn-sm";
    toggleButton.style.marginLeft = "10px";
    toggleButton.style.padding = "2px 6px";
    toggleButton.style.fontSize = "12px";
    toggleButton.style.cursor = "pointer";
    toggleButton.style.position = "relative";
    toggleButton.style.zIndex = "1";

    // Define color schemes
    const colorSchemes = {
        success: {
            normal: { bg: "#69cf64", border: "#2bc14a", color: "#fff" },
            hover: { bg: "#28a745", border: "#1e7e34", color: "#fff" }
        },
        secondary: {
            normal: { bg: "#6c757d", border: "#6c757d", color: "#fff" },
            hover: { bg: "#5a6268", border: "#545b62", color: "#fff" }
        }
    };

    // Track current state for hover effects
    let isHovered = false;

    // Function to apply colors to button
    function applyColors() {
        const scheme = settings.filtersByDefault ? colorSchemes.success : colorSchemes.secondary;
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

    // Body container for subtitle links
    const body = document.createElement("div");
    body.className = "panel-body";

    // Function to update the filtered subtitles list display
    function updateFiler() {
        toggleButton.textContent = settings.filtersByDefault ? "Filter ON" : "Filter OFF";
        updateButtonStyle();
        const filteredSubtitles = settings.filtersByDefault
            ? subtitles.filter(subtitle =>
                settings.languageFilters.some(filter =>
                    subtitle.text.includes(`${filter} [`) ||
                    subtitle.text.includes(`[${filter},`) ||
                    subtitle.text.includes("All Attachments")
                )
            )
            : subtitles;
        body.innerHTML = "";
        filteredSubtitles.forEach(({ text, link }, index) => {
            const anchor = document.createElement("a");
            anchor.href = link;
            anchor.textContent = text;
            anchor.target = "_blank";
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
        settings.filtersByDefault = !settings.filtersByDefault;
        updateFiler();
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
    makePanelCollapsible(attachmentsPanel, settings.attachments === "hide");

    // **Call updateFiler once here to respect filtersByDefault on initial load**
    updateFiler();
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

    let firstEpId = null;
    let firstEpFilename = null; // Without folder name
    if (tosho.files) {
        for (const file of tosho.files) {
            const filename = file.filename.toLowerCase();
            if (!filename.endsWith(".mkv") && !filename.endsWith(".mp4") && !filename.endsWith(".ts")) continue;
            if ((filename.startsWith("extra") || filename.startsWith("bonus") || filename.startsWith("special") || filename.startsWith("creditless")) && filename.includes("/")) continue;
            firstEpId = file.id;
            firstEpFilename = file.filename.split("/").pop();
            break;
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

    // MyAnimeList
    const mal = magnet?.cloneNode(true);
    mal.href = `https://myanimelist.net/anime/0`
    if (tosho.anidb_aid && settings.myanimelist) {
        let text = document.createTextNode(" or ")
        parent?.appendChild(text)

        mal.querySelector("i").remove()
        mal.innerHTML = '<i class="fa-solid fa-database fa-fw"></i>MyAnimeList'

        mal.onclick = async function () {
            event.preventDefault()
            if (!linkMap) {
                linkMap = await fetchUrl(`https://animeapi.my.id/anidb/${tosho.anidb_aid}`)
                mal.href = `https://myanimelist.net/anime/${linkMap.myanimelist}`
            }

            window.open(`https://myanimelist.net/anime/${linkMap.myanimelist}`, '_blank').focus();
            return false
        };
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

        anilist.onclick = async function () {
            event.preventDefault()
            if (!linkMap) {
                linkMap = await fetchUrl(`https://animeapi.my.id/anidb/${tosho.anidb_aid}`)
                anilist.href = `https://anilist.co/anime/${linkMap.anilist}`
            }

            window.open(`https://anilist.co/anime/${linkMap.anilist}`, '_blank').focus();
            return false
        };
        parent?.appendChild(anilist);
    }

    // Animetosho link
    if (toshoViewPageUrl && settings.animetosho) {
        let text = document.createTextNode(" or ")
        parent?.appendChild(text)

        const animetosho = magnet?.cloneNode(true);

        animetosho.querySelector("i").remove()
        animetosho.innerHTML = '<i class="fa-solid fa-at fa-fw"></i>AnimeTosho';
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

    let subtitles = [];
    let batchFirstEp = "";
    // Attachments
    if (firstEpId && toshoViewPageUrl) {
        subtitles = await fetchSubtitlesSection(toshoViewPageUrl);
        // console.log(subtitles);
        // Likely batch release so get the track attachments from first episode
        if (subtitles.length == 1) {
            if (subtitles[0].text == "All Attachments") {
                subtitles[0].text = "All Attachments (Batch)";
            }
            batchFirstEp = `https://animetosho.org/file/${firstEpId}`;
                const firstEpSubtitles = await fetchSubtitlesSection(batchFirstEp);
                subtitles = [...subtitles, ...firstEpSubtitles.slice(1)];

        }

        if (settings.attachments !== "no" && subtitles.length > 0) {
            addSubtitlesToTorrentList(subtitles, settings.attachments === "hide");
        }
    }

    // Screenshots
    if (toshoViewPageUrl && settings.screenshots !== "no") {
        let screenshots = [];
        if (batchFirstEp) {
            screenshots = await fetchScreenshots(batchFirstEp);
        } else {
            screenshots = await fetchScreenshots(toshoViewPageUrl);
        }
        addScreenshotsToPage(screenshots, subtitles, firstEpFilename);
    }

    // Fileinfo
    if (firstEpId && settings.fileinfo) {
        const fileInfo = await fetchUrl(`https://feed.animetosho.org/json?show=file&id=${firstEpId}`);
            // console.log(fileInfo)
            try {
            if (!fileInfo.info.mediainfo);
            let text = document.createTextNode(" or ");
            parent?.appendChild(text);

            const mediainfo = magnet?.cloneNode(true);
            mediainfo.querySelector("i").remove();
            mediainfo.innerHTML = '<i class="fa-solid fa-file fa-fw"></i>Fileinfo';
            mediainfo.href = "#";

            mediainfo.onclick = function () {
                const htmlContent = `
                    <!DOCTYPE html>
                    <html>
                    <head>
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
                        <pre>${fileInfo.info.mediainfo}</pre>
                    </body>
                    </html>
                `;
                const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');

                return false;
            };

            parent?.appendChild(mediainfo);
        } catch (e) {
        }

    }

    // Delayed fetch so that the other ones are available faster
    if (settings.anilist || settings.myanimelist) {
        if (!linkMap) linkMap = await fetchUrl(`https://animeapi.my.id/anidb/${tosho.anidb_aid}`);
        anilist.href = `https://anilist.co/anime/${linkMap.anilist}`;
        mal.href = `https://myanimelist.net/anime/${linkMap.myanimelist}`;
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
        Object.keys(settings).forEach(key => {
            const el = document.getElementById(`setting-${key}`);
            if (typeof settings[key] === "boolean") {
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
        settingsUI.style.width = "350px";
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
                #settings-ui .settings-header {
                    margin-top: 0;
                    text-align: center;
                    color: #ffffff;
                    font-size: 20px;
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
                ${Object.keys(settings)
                .filter(key => !['nzb','sabUrl','nzbKey','screenshots','previewSize','subsByDefault','attachments','filtersByDefault','languageFilters'].includes(key))
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
                </select></label>
                <hr style="border: 0; border-top: 1px solid #555; margin: 15px 0;">
                </div>

                <div id="setting-attachments-group">
                <label><span>attachments:</span><select id="setting-attachments">
                        <option value="no" ${settings.attachments === "no" ? "selected" : ""}>No</option>
                        <option value="hide" ${settings.attachments === "hide" ? "selected" : ""}>Hide</option>
                        <option value="show" ${settings.attachments === "show" ? "selected" : ""}>Show</option>
                    </select></label>
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
        settingsUI.querySelector('#setting-nzb').addEventListener('change', function() {
            const show = this.checked;
            settingsUI.querySelector('#setting-sabUrl-row').style.display = show ? '' : 'none';
            settingsUI.querySelector('#setting-nzbKey-row').style.display = show ? '' : 'none';
        });
        settingsUI.querySelector('#setting-screenshots').addEventListener('change', function() {
            const show = this.value !== 'no';
            settingsUI.querySelector('#setting-previewSize-row').style.display = show ? '' : 'none';
            settingsUI.querySelector('#setting-subsByDefault-row').style.display = show ? '' : 'none';
        });
        settingsUI.querySelector('#setting-attachments').addEventListener('change', function() {
            const show = this.value !== 'no';
            settingsUI.querySelector('#setting-filtersByDefault-row').style.display = show ? '' : 'none';
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
        closeSettingsUI = function() {
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
    }

    // Add settings button to navbar
    const navbar = document.querySelector(".navbar-nav");
    const settingsItem = document.createElement("li");
    settingsItem.className = "nav-item";
    const settingsLink = document.createElement("a");
    settingsLink.className = "nav-link";
    settingsLink.innerHTML = 'NY-AT <i class="fa fa-cog" aria-hidden="true"></i>';
    settingsLink.title = "NY-AT Settings";
    settingsLink.style.cursor = "pointer";
    settingsLink.id = "nyat-settings-link";
    settingsLink.addEventListener("click", function(e) {
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

(async function () {
    'use strict';
    document.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">');

    await doSettings();
    await doFeatures();
})();
