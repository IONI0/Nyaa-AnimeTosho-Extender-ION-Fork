### 0.61-22
- [+] Ctrl-clicking, cmd-clicking or middle clicking attachments when attachmentAction is "View" now opens them in new tab without focus. This also applies to fileinfo, mal/anilist. Note that this doesn't work for the right click "open in new tab" or potentially other custom ways of opening in new tab. It can also be inconsistent on some browsers.
- [+] For pages with multiple episodes, you can now choose which episode fileinfo, attachments, screenshots come from by clicking on the corresponding episode in file list. There is an icon change for the episode selected
- [>] Switched the connecting api which translates anidb id to mal and anilist from `animeapi` to `plexanibridge-api` to fix some series not getting data. This can be reverted in code by changing `anidbConnectingAPI` but is not a user option right now.
- [>] Remove unnecessary preview if subtitle is PGS format

### 0.61-23
- [*] Fix bug where multiple eventlisteners were active when switching episodes in files list

### 0.61-24
- [*] Change screenshots default option from "Show" to "Hide" to avoid spoilers
- [+] Add torrent description collapse button to the right of the header. If you are changing files in file list and want to see their fileinfo it may be nice to collapse long descriptions so you don't have to scroll.
- [+] Support torrents with only nekoBT_id