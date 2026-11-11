# The Commons — Forumotion (phpBB3) theme

Seasonal flexbox theme: 4 seasons, 6 holidays (Valentine's, St. Patrick's, Easter,
Halloween, Christmas, New Year), display options, levels & badges, private messages
as conversations.

## Install on a forum

1. Log in to the forum's Administration Panel (enter the password once).
2. Create an HTML page (Modules > HTML pages management), paste
   `installer/installer.html` into it and open the page.
3. The installer reads the forum, shows what will change, makes a backup,
   then installs the templates and the JavaScript modules.

## What is in here

| Path | What |
|---|---|
| `manifest.json` | what gets installed: templates (name -> file), JavaScript modules, notes |
| `templates/` | the templates, by admin panel group |
| `js/` | the JavaScript modules (installed "In all the pages") |
| `css/global-min.css` | the stylesheet, loaded by `overall_header` from jsDelivr |
| `installer/` | the installer: `install.js`, `catalog.json` (template IDs), `installer.html` |

## Updating the stylesheet

`overall_header` loads `css/global-min.css` through jsDelivr pinned to a commit
(`@abc1234`). After changing the CSS: commit it, then put that commit's hash in
`overall_header` and commit again.
