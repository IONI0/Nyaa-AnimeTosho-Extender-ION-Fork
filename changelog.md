### 0.61-22
- [+] Ctrl-clicking, cmd-clicking or middle clicking attachments when attachmentAction is "View" now opens them in new tab without focus. This also applies to fileinfo, mal/anilist. Note that this doesn't work for the right click "open in new tab" or potentially other custom ways of opening in new tab. It can also be inconsistent on some browsers.
- [+] For pages with multiple episodes, you can now choose which episode fileinfo, attachments, screenshots come from by clicking on the corresponding episode in file list. There is an icon change for the episode selected
- [>] Switched the connecting api which translates anidb id to mal and anilist from `animeapi` to `plexanibridge-api` to fix some series not getting data. This can be reverted in code by changing `anidbConnectingAPI` but is not a user option right now.
- [>] Remove unnecessary preview if subtitle is PGS format

### 0.61-23
- [>] Fix bug where multiple eventlisteners were active when switching episodes in files list

### 0.61-24
- [>] Change screenshots default option from "Show" to "Hide" to avoid spoilers
- [+] Add torrent description collapse button to the right of the header. If you are changing files in file list and want to see their fileinfo it may be nice to collapse long descriptions so you don't have to scroll.
- [+] Support torrents with only nekoBT_id

### 0.61-25
- [>] When AniDB -> AniList/MAL linking fails, clicking on them will give the option to go to AniDB page instead of doing nothing
- [>] Fixed MAL/AniList ID being a list if multiple are associated with an AbiDB id, it will now select the first one.

### V1.0
- [+] Initial support for animetosho.xyz
- [+] Option to add a description header as well as change its visibility
- [+] Added a fileinfo panel (can be set as an item with the other links, a panel, or both)
- [+] Initial size of fileinfo panel is adjustable and are able to drag to resize
- [+] Option to choose how all panels on the view page are arranged
- [+] Added ability to group panels together and switch between them with tabs
- [>] Default arrangement of panels changed
- [>] Settings page redesigned
- [>] Anidb to anilist/mal connecting api changed back to `animeapi`
- [#] Animetosho.org remains the info source for everything before 2026.05.09
- [#] Animetosho.xyz currently operates on a whitelist
- [#] Screenshots subtitles selection and timestamps are currently not available on animetosho.xyz

### V1.0.1
- [>] Updated tabs to overflow nicer when screen is narrow

### V1.0.2
- [>] Fix NZB with api key for animetosho.xyz

### V1.1.0
- [+] Initial support for Tsukihime.org
- [+] Added option to add NekoBT link
- [>] Fixes for animetosho.xyz due to changed layout
- [>] Initial fetch for animetosho.xyz now uses api

### V1.1.1
- [>] Fix "All Attachments" appearing for Tsukihime even when there are no attachments
- [>] Changed to not add ?s= param when selecting SRT tracks as they are not rendered anyways

### V1.1.2
- [>] Defer to nekobt api search if nekobt id not found in Tsukihime api
- [>] Fix for First Non-forced subtitle track selection on Tsukihime

### V1.1.3
- [>] Fix for anilist and mal link on tsukihime releases without an anidb id

### V1.2.0
- [>] Fallback to Animetosho.xyz if tsukihime times out
- [>] Animetosho.xyz new api support in anticipation for removal on August 1st
- [#] Rendered subtitles on video on animetosho.xyz are not yet supported as they seem to not be completely rolled out yet
- [>] Fix different character length estimates due to CRLF on tsukihime
- [>] Fix for releases with no anime_id on tsukihime
- [>] Added .avi to parsed video extensions

### V1.2.1
- [>] Fix tsukihime links showing when fetches fail and limit fetches to anime category

### V1.2.2
- [>] Fix animetosho.org information not filling due to a typo
- [+] Added Setting to prioritise infosource between TsukiHime and AnimeTosho.xyz
- [#] They will still fallback to each other and pre may 2026 will still use AnimeTosho.org for now
- [>] Fix for "All Attachments" link being missing on some animetosho.xyz releases