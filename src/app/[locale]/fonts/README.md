# Fonts

## `material-symbols-outlined-subset.woff2`

Material Symbols Outlined, variable, `wght 400 / FILL 0 / GRAD 0 / opsz 20..48`, subsetted to
the icons the application actually uses.

- full variable font: **713 128 bytes** (696.4 KB)
- this subset (37 icons): **10 068 bytes** (9.8 KB) — **98.6% smaller**

696 KB of icon font would have dominated LCP on the public pages and broken the budget in
`18-cms-seo.md` §Performance on its own. Google's CSS API subsets by icon name, so the file
below contains only the glyphs listed here.

### Regenerating after adding an icon

Add the name to the list, re-run, and commit both the list and the file:

```bash
ICONS="account_circle,add,arrow_back,arrow_forward,calendar_month,check,check_circle,chevron_left,chevron_right,close,contact_support,dashboard,delete,description,edit,error,expand_more,factory,group,home,info,inventory_2,language,logout,menu,more_vert,notifications,payments,pending_actions,query_stats,search,settings,star,storefront,upload,visibility,warning"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
curl -s -A "$UA" "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,400,0,0&icon_names=$ICONS" -o /tmp/ms.css
curl -s -o src/app/fonts/material-symbols-outlined-subset.woff2 \
  "$(grep -o 'url(\(https://[^)]*\))' /tmp/ms.css | sed 's/^url(//; s/)$//')"
```

An icon used in JSX but missing from the subset renders as its ligature text, which is
visible immediately in `/dev/ui`.
