# Nyaa AnimeTosho Extender ION Fork

Userscript that extends Nyaa view page with AnimeTosho information. Original script by [Jimbo](https://gitea.com/Jimbo/PT-Userscripts/src/branch/main/nyaa-animetosho.user.js). All information comes from [AnimeTosho](https://animetosho.org/) which only scrapes the Anime English-translated category, skips big files, and takes time to process new episodes.

### Functionality
- Link to AnimeTosho page
- NZB link with option for unique sabUrl and NZB key
- Fileinfo for the primary file
- (New) Settings GUI to modularly enable what features you want
- (New) Uses font icons instead of compressed images
- (New) Link to AniDB/MyAnimeList/AniList
- (New) Screenshots with a dropdown to select which subtitle track present in the screenshots
- (New) Full-size screenshot viewer
- (New) Attachment download options for all tracks and language filters
- (New) Collapsible headings for everything

---

### View page
![](main_image.jpg)

---

### Screenshot Viewer
![Screenshot Viewer](screenshot_viewer.jpg)

---

### Notes
- Access the settings GUI in the top nav bar. Settings should save over updates
- sabUrl and NZB key are optional settings if you have them
- Screenshots previews are loaded as jpgs, click in to see full png
- SRT subtitles and maybe other formats are not included in the screenshot on AnimeTosho
- For batch releases, Attachments will show All Attachments for everything and the individual tracks for the first episode only

---

### Acknowledgements
- AI was heavily used for this since I do not know js/html. Apologies for code quality but I will try my best to fix any issues.
- [animeApi](https://github.com/nattadasu/animeApi) for linking AniDB with other anime services