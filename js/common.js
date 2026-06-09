/* ===========================================================================
   Shared helpers for the iPad Arcade.
   Touch input, light haptics, and high-score persistence.
   =========================================================================== */

const Arcade = (() => {
  /* ---- Asset version (cache-buster) ----
     Bump this whenever audio clips/manifests (or this file) change so iOS
     Safari can't serve a stale manifest or clip. Appended as ?v=... to every
     manifest + mp3 URL the AudioBank fetches. */
  const ASSET_VER = "20260607d";

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

  /* ---- AudioBank: pre-recorded voice clips with graceful absence ----
     Reusable across games. Loads one or more manifest.json files that list clip
     keys, builds a key -> URL map, and plays a clip by key through a SINGLE
     shared <audio> element.

     Why one element (not one per key): iOS Safari has a very limited media
     decoder. Instantiating/decoding ~60 HTMLAudio elements (and priming them all
     in one Start-tap unlock()) overwhelms it and yields MediaError code 3
     (MEDIA_ERR_DECODE) at runtime even though every file downloads fine. Using a
     single reusable element that we re-point via .src per play() means only ONE
     clip is ever decoded at a time — which matches the game (the announcer says
     one thing at a time) and eliminates the mass-decode that triggered code 3.

     A bank can merge clips from SEVERAL folders so a game can combine a shared,
     game-agnostic library (e.g. ../audio/letters/) with its own game-specific
     folder (e.g. ../audio/dino/). If the same key appears in more than one
     folder, the one loaded LAST wins.

     API:
       const bank = Arcade.AudioBank({ dir: "../audio/dino/" });            // one folder
       const bank = Arcade.AudioBank({ dirs: ["../audio/letters/", "../audio/dino/"] });
       bank.load();                 // fetch manifest(s), build the URL map (async/safe)
       bank.unlock();               // call inside a user gesture (e.g. Start tap)
       if (!bank.play("letter_A"))  // returns false if the key isn't in the map
         fallbackSpeak();           // ...so the caller can fall back to TTS

     If a manifest/file is missing, that source is skipped; with no keys mapped,
     every play() returns false and the game keeps working via speechSynthesis. */
  const MEDIA_ERR = { 1: "ABORTED", 2: "NETWORK", 3: "DECODE", 4: "SRC_NOT_SUPPORTED" };

  function createAudioBank({ dir = "", dirs = null, version = null } = {}) {
    const urlMap = {}; // key -> cache-busted mp3 URL (NO per-key Audio elements)
    let ready = false;
    let lastError = ""; // surfaced via getters for on-screen debugging
    let lastKey = "";
    let lastUrl = "";
    let lastErrorCode = null;
    let lastErrorName = "";

    const norm = (d) => (d && !d.endsWith("/") ? d + "/" : d || "");
    // Cache-buster appended to manifest + clip URLs (see ASSET_VER above). Pass
    // {version} to override. Guarantees iOS can't reuse a stale map.
    const ver = version || ASSET_VER;
    const bust = (url) => url + (url.indexOf("?") >= 0 ? "&" : "?") + "v=" + encodeURIComponent(ver);
    // Folders configured at construction time (dirs[] takes precedence).
    const initialDirs = (Array.isArray(dirs) ? dirs : dir ? [dir] : []).map(norm);

    // The ONE shared element. Created once (not per key). All clips play here.
    const el = typeof Audio !== "undefined" ? new Audio() : null;
    if (el) {
      el.preload = "none"; // don't pre-decode; we set .src per play()
      el.addEventListener("error", () => {
        const me = el.error;
        lastErrorCode = me ? me.code : null;
        lastErrorName = (lastErrorCode != null && MEDIA_ERR[lastErrorCode]) || "";
        lastError =
          "audio err code " +
          (lastErrorCode != null ? lastErrorCode : "?") +
          (lastErrorName ? " " + lastErrorName : "") +
          (lastKey ? " (" + lastKey + ")" : "");
      });
    }

    // Load a folder's manifest and add its keys to the URL map. No Audio elements
    // are created here — just key -> URL strings.
    async function loadOne(rawDir) {
      const d = norm(rawDir);
      try {
        // no-store: never let iOS Safari serve a cached manifest.
        const res = await fetch(bust(d + "manifest.json"), { cache: "no-store" });
        if (!res.ok) {
          lastError = "manifest " + res.status + " @ " + d;
          return false;
        }
        const data = await res.json();
        const keys = Array.isArray(data) ? data : data.keys || [];
        keys.forEach((k) => {
          urlMap[k] = bust(d + k + ".mp3"); // later folders override earlier by key
        });
        if (keys.length > 0) ready = true;
        return keys.length > 0;
      } catch (e) {
        lastError = "load failed: " + (e && e.message ? e.message : e);
        return false;
      }
    }

    // load() loads the folder(s) configured at construction. Pass a folder
    // string or array to merge additional banks at any time. Returns true if at
    // least one source mapped any keys.
    async function load(extra) {
      const targets =
        extra != null ? (Array.isArray(extra) ? extra : [extra]) : initialDirs;
      let any = false;
      for (const t of targets) {
        if (await loadOne(t)) any = true;
      }
      return any;
    }

    // iOS only allows programmatic audio on an element that was play()'d inside a
    // user gesture. Unlock the SINGLE shared element (no 60-element loop -> no
    // mass decode). The deferred reset must not clobber a real play() that took
    // over in the meantime.
    function unlock() {
      if (!el) return;
      try {
        if (!el.src) {
          const first = Object.values(urlMap)[0];
          if (first) el.src = first;
        }
        el.muted = true;
        const p = el.play();
        const reset = () => {
          if (!el.muted) return; // a real play() took over; leave it playing
          try {
            el.pause();
            el.currentTime = 0;
          } catch {}
          el.muted = false;
        };
        if (p && p.then) p.then(reset).catch(() => (el.muted = false));
        else reset();
      } catch {
        /* ignore */
      }
    }

    function has(key) {
      return !!urlMap[key];
    }

    // Returns true if KEY is in the map (so the caller won't fall back to speech)
    // and points the shared element at it and plays. currentTime reset is
    // best-effort (it can throw on iOS before metadata loads) and must never
    // prevent the actual play().
    function play(key, onended) {
      const url = urlMap[key];
      if (!url || !el) return false; // no clip -> caller falls back to speech
      lastKey = key;
      lastUrl = url;
      el.onended = onended || null;
      el.muted = false;
      try {
        el.src = url; // re-point the single element; resets playback to the start
      } catch {}
      try {
        el.currentTime = 0; // best-effort; harmless once src is set
      } catch {}
      try {
        const p = el.play();
        if (p && p.catch)
          p.catch((e) => {
            lastError = "play rejected: " + (e && e.name ? e.name : e) + " (" + key + ")";
          });
      } catch (e) {
        lastError = "play threw: " + (e && e.name ? e.name : e) + " (" + key + ")";
      }
      return true;
    }

    function stop() {
      if (!el) return;
      try {
        el.pause();
        el.currentTime = 0;
      } catch {}
    }

    return {
      load,
      unlock,
      has,
      play,
      stop,
      urlFor(key) {
        return urlMap[key] || "";
      },
      get ready() {
        return ready;
      },
      get loaded() {
        return ready;
      },
      get size() {
        return Object.keys(urlMap).length;
      },
      get lastError() {
        return lastError;
      },
      get lastUrl() {
        return lastUrl;
      },
      get lastErrorCode() {
        return lastErrorCode;
      },
      get lastErrorName() {
        return lastErrorName;
      },
      get version() {
        return ver;
      },
      get dir() {
        return initialDirs[0] || "";
      },
      get dirs() {
        return initialDirs.slice();
      },
    };
  }

  return {
    getHighScore,
    setHighScore,
    buzz,
    onTap,
    onSwipe,
    bindArrowKeys,
    goHome,
    AudioBank: createAudioBank,
  };
})();
