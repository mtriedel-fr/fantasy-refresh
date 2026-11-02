// NFL home-stadium coordinates + roof type, for game-day weather.
// roof: 'outdoor' (full exposure), 'retractable' (roof may be open — treated as
// sheltered here, since whether it's open isn't knowable in advance), 'fixed'
// (permanent translucent roof, e.g. SoFi — no precipitation), 'dome' (fully
// enclosed, climate-controlled). Weather is shown only for 'outdoor'; the rest
// are reported as indoor/sheltered. Keyed by the team abbreviations the schedule
// uses (WSH, JAX, LV, LAC, LAR).
(function (global) {
  'use strict';
  var S = {
    ARI: { lat: 33.5276, lon: -112.2626, roof: 'retractable', name: 'State Farm Stadium' },
    ATL: { lat: 33.7555, lon: -84.4008,  roof: 'retractable', name: 'Mercedes-Benz Stadium' },
    BAL: { lat: 39.2780, lon: -76.6227,  roof: 'outdoor',     name: 'M&T Bank Stadium' },
    BUF: { lat: 42.7738, lon: -78.7870,  roof: 'outdoor',     name: 'Highmark Stadium' },
    CAR: { lat: 35.2258, lon: -80.8528,  roof: 'outdoor',     name: 'Bank of America Stadium' },
    CHI: { lat: 41.8623, lon: -87.6167,  roof: 'outdoor',     name: 'Soldier Field' },
    CIN: { lat: 39.0954, lon: -84.5160,  roof: 'outdoor',     name: 'Paycor Stadium' },
    CLE: { lat: 41.5061, lon: -81.6995,  roof: 'outdoor',     name: 'Huntington Bank Field' },
    DAL: { lat: 32.7473, lon: -97.0945,  roof: 'retractable', name: 'AT&T Stadium' },
    DEN: { lat: 39.7439, lon: -105.0201, roof: 'outdoor',     name: 'Empower Field at Mile High' },
    DET: { lat: 42.3400, lon: -83.0456,  roof: 'dome',        name: 'Ford Field' },
    GB:  { lat: 44.5013, lon: -88.0622,  roof: 'outdoor',     name: 'Lambeau Field' },
    HOU: { lat: 29.6847, lon: -95.4107,  roof: 'retractable', name: 'NRG Stadium' },
    IND: { lat: 39.7601, lon: -86.1639,  roof: 'retractable', name: 'Lucas Oil Stadium' },
    JAX: { lat: 30.3239, lon: -81.6373,  roof: 'outdoor',     name: 'EverBank Stadium' },
    KC:  { lat: 39.0489, lon: -94.4839,  roof: 'outdoor',     name: 'Arrowhead Stadium' },
    LV:  { lat: 36.0909, lon: -115.1833, roof: 'dome',        name: 'Allegiant Stadium' },
    LAC: { lat: 33.9535, lon: -118.3392, roof: 'fixed',       name: 'SoFi Stadium' },
    LAR: { lat: 33.9535, lon: -118.3392, roof: 'fixed',       name: 'SoFi Stadium' },
    MIA: { lat: 25.9580, lon: -80.2389,  roof: 'outdoor',     name: 'Hard Rock Stadium' },
    MIN: { lat: 44.9736, lon: -93.2575,  roof: 'fixed',       name: 'U.S. Bank Stadium' },
    NE:  { lat: 42.0909, lon: -71.2643,  roof: 'outdoor',     name: 'Gillette Stadium' },
    NO:  { lat: 29.9511, lon: -90.0812,  roof: 'dome',        name: 'Caesars Superdome' },
    NYG: { lat: 40.8135, lon: -74.0745,  roof: 'outdoor',     name: 'MetLife Stadium' },
    NYJ: { lat: 40.8135, lon: -74.0745,  roof: 'outdoor',     name: 'MetLife Stadium' },
    PHI: { lat: 39.9008, lon: -75.1675,  roof: 'outdoor',     name: 'Lincoln Financial Field' },
    PIT: { lat: 40.4468, lon: -80.0158,  roof: 'outdoor',     name: 'Acrisure Stadium' },
    SEA: { lat: 47.5952, lon: -122.3316, roof: 'outdoor',     name: 'Lumen Field' },
    SF:  { lat: 37.4030, lon: -121.9700, roof: 'outdoor',     name: "Levi's Stadium" },
    TB:  { lat: 27.9759, lon: -82.5033,  roof: 'outdoor',     name: 'Raymond James Stadium' },
    TEN: { lat: 36.1665, lon: -86.7713,  roof: 'outdoor',     name: 'Nissan Stadium' },
    WSH: { lat: 38.9078, lon: -76.8645,  roof: 'outdoor',     name: 'Northwest Stadium' }
  };
  // A few abbreviations vary by data source — normalize to the keys above.
  var ALIAS = { WAS: 'WSH', JAC: 'JAX', LA: 'LAR', OAK: 'LV', SD: 'LAC', STL: 'LAR' };
  S.get = function (team) {
    if (!team) return null;
    var k = String(team).toUpperCase();
    return S[k] || S[ALIAS[k]] || null;
  };
  // Only fully-open stadiums get a live forecast; everything else is sheltered.
  S.isOutdoor = function (team) {
    var s = S.get(team);
    return !!(s && s.roof === 'outdoor');
  };

  global.FR_STADIUMS = S;
  if (typeof module !== 'undefined' && module.exports) module.exports = S;
})(typeof globalThis !== 'undefined' ? globalThis : this);
