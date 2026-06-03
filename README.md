# iPad Arcade

A tiny framework for building simple HTML games that play great on an iPad. No
build step, no dependencies — just open `index.html`.

## Play now

Hosted on GitHub Pages — open these on your iPad (and use Safari's
**Share → Add to Home Screen** for a fullscreen icon):

- **Launcher (all games):** https://skant.github.io/ipad-games/
- 🦄 **Pony Rainbow Rescue:** https://skant.github.io/ipad-games/games/pony-rainbow.html
- 🐢 **Turtle Numbers:** https://skant.github.io/ipad-games/games/turtle-numbers.html

## Structure

```
ipad-games/
├── index.html            # Launcher / home screen (data-driven)
├── css/common.css        # Shared styles + all the iPad touch tweaks
├── js/common.js          # Shared helpers: Arcade.onTap / onSwipe / buzz / scores
├── js/games.js           # The games manifest (one entry per game)
├── games/
│   └── _template.html    # Copy this to start a new game
└── README.md
```

## Add a new game (2 steps)

1. **Copy the template**

   ```sh
   cp games/_template.html games/my-game.html
   ```

   Open it, set `GAME_ID` to a unique value, and build your game inside the
   `#board` element.

2. **Register it** in `js/games.js`:

   ```js
   const GAMES = [
     {
       id: "my-game",            // must match GAME_ID in the html
       title: "My Game",
       desc: "Tap / swipe to play",
       emoji: "🎮",
       glow: "rgba(108,123,255,0.35)",
       path: "games/my-game.html",
     },
   ];
   ```

   It now appears on the home screen automatically.

## What the framework gives you

**Touch optimizations (already applied via `common.css` + viewport meta):**

- No 300ms tap delay and no double-tap zoom (`touch-action: manipulation`)
- No tap highlight flash or long-press callout menu
- No rubber-band / overscroll bounce
- Safe-area padding so content clears the camera/home indicator
- Fullscreen when "Add to Home Screen" is used

**Helpers in `Arcade` (`common.js`):**

| Helper                              | Use                                                        |
| ----------------------------------- | ---------------------------------------------------------- |
| `Arcade.onTap(el, fn)`              | Instant tap, no ghost clicks. Works with mouse on desktop. |
| `Arcade.onSwipe(el, fn)`            | `fn(dir)` with `up` / `down` / `left` / `right`.           |
| `Arcade.bindArrowKeys(fn)`          | Map arrow keys to swipe dirs for desktop testing.          |
| `Arcade.buzz(ms)`                   | Light haptic where supported.                              |
| `Arcade.getHighScore(id)`           | Read a game's best score.                                  |
| `Arcade.setHighScore(id, score)`    | Save if it's a new best; returns `true` on a record.       |
| `Arcade.goHome()`                   | Back to the launcher.                                      |

## Run it locally

A static server is the easiest way to test (avoids `file://` quirks):

```sh
cd ipad-games
python3 -m http.server 8000
```

Then open `http://localhost:8000` — or, on an iPad on the same Wi-Fi, visit
`http://<your-mac-ip>:8000`.
