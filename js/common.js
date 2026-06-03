/* ===========================================================================
   Shared helpers for the iPad Arcade.
   Touch input, light haptics, and high-score persistence.
   =========================================================================== */

const Arcade = (() => {
  /* ---- High scores (localStorage) ---- */
  const KEY = "ipad-arcade-highscores";

  function getHighScore(game) {
    try {
      const all = JSON.parse(localStorage.getItem(KEY) || "{}");
      return all[game] || 0;
    } catch {
      return 0;
    }
  }

  function setHighScore(game, score) {
    try {
      const all = JSON.parse(localStorage.getItem(KEY) || "{}");
      if (score > (all[game] || 0)) {
        all[game] = score;
        localStorage.setItem(KEY, JSON.stringify(all));
        return true; // new record
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  /* ---- Haptics (works on supported iPads/Safari) ---- */
  function buzz(ms = 12) {
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  /* ---- Tap: fires immediately on touch, no 300ms delay, no ghost click ---- */
  function onTap(el, handler) {
    let touched = false;
    el.addEventListener(
      "touchstart",
      (e) => {
        touched = true;
        handler(e);
      },
      { passive: true }
    );
    el.addEventListener("click", (e) => {
      // Allow mouse/trackpad on desktop, but skip the ghost click after touch.
      if (touched) {
        touched = false;
        return;
      }
      handler(e);
    });
  }

  /* ---- Swipe detection on an element ----
     callback receives one of: 'up' | 'down' | 'left' | 'right' */
  function onSwipe(el, callback, { threshold = 28 } = {}) {
    let x0 = 0;
    let y0 = 0;
    let tracking = false;

    el.addEventListener(
      "touchstart",
      (e) => {
        const t = e.changedTouches[0];
        x0 = t.clientX;
        y0 = t.clientY;
        tracking = true;
      },
      { passive: true }
    );

    el.addEventListener(
      "touchmove",
      (e) => {
        // Stop the page from scrolling while swiping inside the game.
        if (tracking) e.preventDefault();
      },
      { passive: false }
    );

    el.addEventListener(
      "touchend",
      (e) => {
        if (!tracking) return;
        tracking = false;
        const t = e.changedTouches[0];
        const dx = t.clientX - x0;
        const dy = t.clientY - y0;
        if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
        if (Math.abs(dx) > Math.abs(dy)) {
          callback(dx > 0 ? "right" : "left");
        } else {
          callback(dy > 0 ? "down" : "up");
        }
      },
      { passive: true }
    );
  }

  /* Also map arrow keys to swipe directions for desktop testing. */
  function bindArrowKeys(callback) {
    window.addEventListener("keydown", (e) => {
      const map = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
      };
      if (map[e.key]) {
        e.preventDefault();
        callback(map[e.key]);
      }
    });
  }

  function goHome() {
    window.location.href = "../index.html";
  }

  return {
    getHighScore,
    setHighScore,
    buzz,
    onTap,
    onSwipe,
    bindArrowKeys,
    goHome,
  };
})();
