# PinDrop

A neighborhood map for small acts of help, built with Next.js.

## Run it

You need Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

For a production build: `npm run build`, then `npm start`.

## Where things are

| Path | What it holds |
| --- | --- |
| `app/globals.css` | All the styles. Colors are the variables at the top (`:root` = light, `.dark` = dark). |
| `app/layout.jsx`, `app/page.jsx` | Page shell, font and metadata |
| `components/PinDropApp.jsx` | Main screen: top bar, filters, map controls, side panel |
| `components/MapView.jsx` | The MapLibre map, pin layers and map key |
| `components/CreatePinDialog.jsx` | The "Drop a pin" form |
| `components/PinDetail.jsx`, `PinFeed.jsx`, `NavigationPanel.jsx` | Side panel views |
| `lib/constants.js` | Categories, sample pins, Bay Area neighborhoods |
| `lib/pins.js` | Pin rules: validation, statuses, distance, search |
| `lib/store.js` | App state. Pins are saved in the browser (IndexedDB). |
| `legacy/` | The original single-file `index.html` build, kept for reference |

## Notes

- Pins are saved in this browser only. Accounts and shared community sync need a server, which this version does not include yet.
- Map tiles and routes come from OpenStreetMap and OSRM and need internet.
- The Bay Area sample listings are fictional.
