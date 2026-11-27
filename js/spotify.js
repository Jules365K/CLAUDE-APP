/* JULES · spotify.js
   What's playing on Spotify, for the top-right corner and the menu bar.
   Through the Spotify connector in claude.ai (its get_currently_playing tool), checked
   every 30 seconds while Jules is open; the progress line moves smoothly in between.
   Album art can't be shown: artifacts can't load pictures from other websites. */
(function () {
  "use strict";
  const J = window.J;
  const SERVER = "Spotify", TOOL = "get_currently_playing";
  const SP = J.spotify = { state: "starting", track: null, at: 0, code: null };
  const listeners = new Set();
  SP.on = fn => { listeners.add(fn); return () => listeners.delete(fn); };
  const emit = () => listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } });
  let mcp = null, unsub = null;

  const pick = (o, ...ks) => { for (const k of ks) if (o && o[k] != null && o[k] !== "") return o[k]; return null; };
  /* The Web API shape ({is_playing, progress_ms, item:{name, artists, duration_ms, external_urls}})
     or a simpler one ({track, artist, isPlaying, url}): read either. */
  SP.normalise = p => {
    if (!p || typeof p !== "object") return null;
    if (typeof p === "string") return null;
    const item = p.item || p.track_info || p.currently_playing || (typeof p.track === "object" ? p.track : null) || p;
    const name = pick(item, "name", "title", "track_name") || (typeof p.track === "string" ? p.track : null);
    if (!name) return null;
    let artists = pick(item, "artists", "artist", "artist_name") || pick(p, "artist", "artists");
    if (Array.isArray(artists)) artists = artists.map(a => (a && a.name) || a).filter(Boolean).join(", ");
    else if (artists && typeof artists === "object") artists = artists.name || "";
    const url = pick(item.external_urls || {}, "spotify") || pick(item, "url", "uri_url", "link") || pick(p, "url");
    const playing = pick(p, "is_playing", "isPlaying", "playing");
    return {
      name: String(name), artist: String(artists || ""),
      playing: playing == null ? true : !!playing,
      progress: +(pick(p, "progress_ms", "progressMs", "progress") || 0),
      duration: +(pick(item, "duration_ms", "durationMs", "duration") || 0),
      url: typeof url === "string" && url.startsWith("https://") ? url : ""
    };
  };
  SP.position = () => {
    const t = SP.track;
    if (!t || !t.duration) return 0;
    const ms = t.progress + (t.playing ? Date.now() - SP.at : 0);
    return Math.min(1, Math.max(0, ms / t.duration));
  };

  SP.ready = (async () => {
    let framed = true; try { framed = window.top !== window.self; } catch (e) {}
    const mayHaveHost = framed || /claude/i.test(location.hostname);
    for (let i = 0; mayHaveHost && i < 20 && !(window.claude && window.claude.use); i++) await new Promise(r => setTimeout(r, 100));
    const C = window.claude;
    if (C && typeof C.use === "function") {
      try { mcp = await Promise.race([C.use("mcp"), new Promise(r => setTimeout(() => r(null), 10000))]); } catch (e) { mcp = null; }
    }
    if (!mcp) { SP.state = "unavailable"; emit(); return false; }
    unsub = mcp.watchTool(SERVER, TOOL, null, ev => {
      if (ev.type === "data") {
        SP.track = SP.normalise(ev.result && ev.result.payload);
        SP.at = Date.now(); SP.state = SP.track ? "ok" : "idle"; SP.code = null;
      } else {
        SP.code = (ev.error && ev.error.code) || "upstream_error";
        SP.state = SP.code === "server_unavailable" && SP.track ? "ok" : "off";
        if (SP.state === "off") SP.track = null;
      }
      emit();
    }, { refetchInterval: 30000, cache: { staleTime: 15000, gcTime: 600000 } });
    return true;
  })();
})();
