/* ===========================================================================
   Games manifest — the single source of truth for the launcher.
   Add one entry per game and it shows up on the home screen automatically.

   Fields:
     id    : unique key, also used for the high-score record (Arcade.setHighScore)
     title : display name on the card
     desc  : short one-line description / how to play
     emoji : icon shown on the card
     glow  : accent glow color for the card (any CSS color)
     path  : path to the game's HTML file, relative to index.html
   =========================================================================== */

const GAMES = [
  {
    id: "pony-rainbow",
    title: "Pony Rainbow Rescue",
    desc: "Tap dragons, zap them with rainbow power!",
    emoji: "🦄",
    glow: "rgba(196,108,255,0.4)",
    path: "games/pony-rainbow.html",
  },
  {
    id: "turtle-numbers",
    title: "Turtle Numbers",
    desc: "Hear a number, pop the match (ages 3+)",
    emoji: "🐢",
    glow: "rgba(69,217,122,0.4)",
    path: "games/turtle-numbers.html",
  },

  // Add more games below. Copy games/_template.html, then add an entry here:
  //
  // {
  //   id: "my-game",
  //   title: "My Game",
  //   desc: "Tap / swipe to play",
  //   emoji: "🎮",
  //   glow: "rgba(108,123,255,0.35)",
  //   path: "games/my-game.html",
  // },
];
