// Game-day weather for the week's NFL games, from Open-Meteo (free, no API key,
// CORS-enabled, called straight from the browser). Forecasts firm up ~7-10 days
// out and this re-fetches (short cache), so on game day it reflects current
// conditions. Outdoor stadiums only; domes/retractable/fixed roofs report as
// sheltered. Depends on FR_STADIUMS (js/stadiums.js).
(function (global) {
  'use strict';

  // WMO weather codes → a short label + emoji.
  var CODES = {
    0: ['Clear', '☀️'], 1: ['Mainly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
    45: ['Fog', '🌫️'], 48: ['Freezing fog', '🌫️'],
    51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Heavy drizzle', '🌦️'],
    56: ['Freezing drizzle', '🌧️'], 57: ['Freezing drizzle', '🌧️'],
    61: ['Light rain', '🌦️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'],
    66: ['Freezing rain', '🌧️'], 67: ['Freezing rain', '🌧️'],
    71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'], 77: ['Snow grains', '🌨️'],
    80: ['Showers', '🌦️'], 81: ['Showers', '🌧️'], 82: ['Heavy showers', '🌧️'],
    85: ['Snow showers', '🌨️'], 86: ['Snow showers', '❄️'],
    95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm', '⛈️'], 99: ['Thunderstorm, hail', '⛈️']
  };
  function codeInfo(code) {
    var c = CODES[code];
    return { label: c ? c[0] : '—', icon: c ? c[1] : '🌡️' };
  }

  // Floor an ISO instant to its UTC hour key, e.g. "2026-11-02T18:00".
  function utcHourKey(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    d.setUTCMinutes(0, 0, 0);
    return d.toISOString().slice(0, 13) + ':00';
  }

  // Is kickoff weather worth flagging? (wind or precip chance notable.)
  function isNotable(w) {
    return !!w && !w.indoor && (w.windMph >= 15 || w.precipPct >= 50 || (w.code >= 71 && w.code <= 86) || w.code >= 95);
  }

  // Severe = worth a lineup warning: strong wind, likely heavy rain, any snow,
  // or thunderstorms. Higher bar than isNotable. Indoor/pending/unknown never.
  function isSevere(w) {
    if (!w || w.indoor || w.pending || w.unknown) return false;
    return w.windMph >= 20
      || w.precipPct >= 70
      || w.code === 65 || w.code === 67 || w.code === 82     // heavy rain / showers
      || (w.code >= 71 && w.code <= 77)                      // snow
      || (w.code >= 85 && w.code <= 86)                      // snow showers
      || w.code >= 95;                                       // thunderstorm
  }

  // Short plain-English reasons a game is severe, e.g. "Blizzard conditions",
  // "High winds (24 mph)". Returns { icon, phrases:[...] }.
  function severeReasons(w) {
    var out = [];
    if (!isSevere(w)) return { icon: w && w.icon, phrases: out };
    var snow = (w.code >= 71 && w.code <= 77) || (w.code >= 85 && w.code <= 86);
    var heavySnow = w.code === 75 || w.code === 86;
    var storm = w.code >= 95;
    var heavyRain = w.code === 65 || w.code === 67 || w.code === 82 || w.precipPct >= 70;
    var blizzard = snow && (heavySnow || w.windMph >= 20);
    if (snow) out.push(blizzard ? 'Blizzard conditions' : 'Snow expected');
    if (storm) out.push('Thunderstorms');
    if (heavyRain && !snow && !storm) out.push('Heavy rain likely' + (w.precipPct ? ' (' + w.precipPct + '%)' : ''));
    if (w.windMph >= 20 && !blizzard) out.push('High winds (' + w.windMph + ' mph)');
    var icon = storm ? '⛈️' : snow ? '🌨️' : heavyRain ? '🌧️' : w.windMph >= 20 ? '💨' : (w.icon || '🌡️');
    return { icon: icon, phrases: out };
  }

  // Build the per-game result from already-fetched hourly data (pure — tested).
  // byStadium: { "lat,lon": { time:[...], temperature_2m:[...], ... } }
  function assemble(games, byStadium) {
    var out = {};
    games.forEach(function (g) {
      var S = global.FR_STADIUMS;
      var st = S && S.get(g.home);
      var key = g.home;
      if (!st) { out[key] = { unknown: true }; return; }
      if (st.roof !== 'outdoor') { out[key] = { indoor: true, roof: st.roof, stadium: st.name }; return; }
      var h = byStadium[st.lat + ',' + st.lon];
      var hk = utcHourKey(g.time);
      var i = h && h.time ? h.time.indexOf(hk) : -1;
      if (!h || i < 0) { out[key] = { pending: true, stadium: st.name }; return; }
      var code = h.weather_code ? h.weather_code[i] : null;
      var info = codeInfo(code);
      out[key] = {
        tempF: Math.round(h.temperature_2m[i]),
        windMph: Math.round(h.wind_speed_10m[i]),
        precipPct: h.precipitation_probability ? Math.round(h.precipitation_probability[i]) : 0,
        code: code, label: info.label, icon: info.icon, stadium: st.name
      };
    });
    for (var k in out) if (out[k]) out[k].notable = isNotable(out[k]);
    return out;
  }

  // Fetch forecasts for the outdoor stadiums among `games` and return the
  // per-game map. Caches in localStorage for `cacheMins` (default 30).
  function load(games, opts) {
    opts = opts || {};
    var cacheMins = opts.cacheMins == null ? 30 : opts.cacheMins;
    games = (games || []).filter(function (g) { return g && g.home && g.time; });
    if (!games.length) return Promise.resolve({});

    var S = global.FR_STADIUMS;
    var outdoor = games.filter(function (g) { return S && S.isOutdoor(g.home); });
    // Nothing outdoor → assemble indoors synchronously, no network.
    if (!outdoor.length) return Promise.resolve(assemble(games, {}));

    // Cache key: the set of stadiums + the hour, so it refreshes through the day.
    var stamp = new Date(); stamp.setMinutes(0, 0, 0);
    var sig = outdoor.map(function (g) { return g.home; }).sort().join(',') + '@' + Math.floor(Date.now() / (cacheMins * 60000));
    var ck = 'fr_weather_' + sig;
    try {
      var hit = JSON.parse(localStorage.getItem(ck) || 'null');
      if (hit) return Promise.resolve(assemble(games, hit));
    } catch (e) {}

    // Unique stadium coordinates, in a stable order.
    var seen = {}, lats = [], lons = [];
    outdoor.forEach(function (g) {
      var st = S.get(g.home); if (!st) return;
      var key = st.lat + ',' + st.lon;
      if (seen[key]) return; seen[key] = true;
      lats.push(st.lat); lons.push(st.lon);
    });

    var url = 'https://api.open-meteo.com/v1/forecast'
      + '?latitude=' + lats.join(',') + '&longitude=' + lons.join(',')
      + '&hourly=temperature_2m,precipitation_probability,wind_speed_10m,weather_code'
      + '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=GMT&forecast_days=16';

    return fetch(url).then(function (r) { return r.json(); }).then(function (data) {
      var arr = Array.isArray(data) ? data : [data];
      var byStadium = {};
      arr.forEach(function (loc) {
        // Open-Meteo echoes back the (rounded) coords; match to our request order.
        byStadium[lats[arr.indexOf(loc)] + ',' + lons[arr.indexOf(loc)]] = loc.hourly || {};
      });
      try { localStorage.setItem(ck, JSON.stringify(byStadium)); } catch (e) {}
      return assemble(games, byStadium);
    }).catch(function () {
      // Network/API failure → still show indoor games and mark the rest pending.
      return assemble(games, {});
    });
  }

  global.FRWeather = { load: load, codeInfo: codeInfo, assemble: assemble, isNotable: isNotable, isSevere: isSevere, severeReasons: severeReasons, utcHourKey: utcHourKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.FRWeather;
})(typeof globalThis !== 'undefined' ? globalThis : this);
