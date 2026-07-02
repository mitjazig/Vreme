/**
 * lightning.js – Real-time strele via Blitzortung WebSocket
 * Brez API ključa, brezplačen javni vir.
 * Protokol: wss://ws{1-8}.blitzortung.org:443/
 * Pošljemo bounding box, prejmemo JSON z lat/lon/time(ns) za vsako strelo.
 */

import { STATION_LAT, STATION_LON } from './astro.js';

// Bounding box: Slovenija + širša okolica
const BOUNDS = { west: 10.0, east: 18.0, north: 48.5, south: 43.0 };

const MAX_AGE_MS  = 60 * 60_000; // 1 ura
const MAX_STRIKES = 600;

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
          * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function strikeStyle(ageMs) {
  if (ageMs <  5 * 60_000) return { color: '#ffffff', fill: '#fffde7', r: 5, opacity: 1.0 };
  if (ageMs < 15 * 60_000) return { color: '#fbbf24', fill: '#fbbf24', r: 4, opacity: 0.9 };
  if (ageMs < 30 * 60_000) return { color: '#f97316', fill: '#f97316', r: 3, opacity: 0.7 };
  return                           { color: '#f43f5e', fill: '#f43f5e', r: 2, opacity: 0.45 };
}

export class LightningTracker {
  /**
   * @param {L.Map}    map       – obstoječ Leaflet zemljevid
   * @param {Function} onUpdate  – callback ob vsaki novi streli
   */
  constructor(map, onUpdate) {
    this.map       = map;
    this.onUpdate  = onUpdate ?? (() => {});
    this.strikes   = [];      // [ { lat, lon, time, marker } ]
    this.layer     = L.layerGroup().addTo(map);
    this.ws        = null;
    this.connected = false;
    this._retryTimer = null;
    this._cleanTimer = setInterval(() => this._purgeOld(), 60_000);
  }

  /** Vzpostavi WebSocket povezavo */
  connect() {
    clearTimeout(this._retryTimer);
    // Blitzortung ima 8 regionalnih strežnikov — izberemo naključnega
    const n   = Math.floor(Math.random() * 8) + 1;
    const url = `wss://ws${n}.blitzortung.org:443/`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.connected = true;
        // Naročimo se na bounding box
        this.ws.send(JSON.stringify(BOUNDS));
        this.onUpdate();
        console.log(`Lightning: connected to ws${n}`);
      };

      this.ws.onmessage = (e) => this._handleMsg(e.data);

      this.ws.onclose = () => {
        this.connected = false;
        this.onUpdate();
        // Reconect po 5s
        this._retryTimer = setTimeout(() => this.connect(), 5_000);
      };

      this.ws.onerror = () => {
        this.connected = false;
        this.ws.close();
      };
    } catch (err) {
      console.warn('Lightning WS error:', err);
      this._retryTimer = setTimeout(() => this.connect(), 10_000);
    }
  }

  disconnect() {
    clearTimeout(this._retryTimer);
    clearInterval(this._cleanTimer);
    this.ws?.close();
    this.layer.clearLayers();
  }

  _handleMsg(raw) {
    try {
      const d = JSON.parse(raw);

      // Podpri različne formate: direktni objekt, array, ali { strokes: [...] }
      let items;
      if (Array.isArray(d)) {
        items = d;
      } else if (d.strokes && Array.isArray(d.strokes)) {
        items = d.strokes;
      } else {
        items = [d];
      }

      let added = 0;
      for (const item of items) {
        // Podpri lat/lon ali x/y (nekateri strežniki)
        const lat = item.lat ?? item.y;
        const lon = item.lon ?? item.x;
        if (lat == null || lon == null) continue;

        // Blitzortung pošilja čas v nanosekundah (18 mest) ali milisekundah (13 mest)
        let timeMs;
        if (item.time) {
          timeMs = item.time > 1e15
            ? Math.floor(item.time / 1_000_000)  // nanosekunde → ms
            : item.time;                           // že milisekunde
        } else {
          timeMs = Date.now();
        }

        // Zavrži preveč stare ali iz prihodnosti
        const now = Date.now();
        if (timeMs > now + 60_000 || now - timeMs > MAX_AGE_MS) continue;

        const strike = { lat, lon, time: timeMs };
        this._addMarker(strike);
        this.strikes.push(strike);
        added++;
      }

      if (added > 0) console.debug(`Lightning: +${added} strel, skupaj ${this.strikes.length}`);

      // Ohrani le MAX_STRIKES
      if (this.strikes.length > MAX_STRIKES) {
        const removed = this.strikes.splice(0, this.strikes.length - MAX_STRIKES);
        for (const s of removed) {
          if (s.marker) this.layer.removeLayer(s.marker);
        }
      }

      this.onUpdate();
    } catch (err) {
      console.debug('Lightning parse error:', err.message, raw?.slice(0, 100));
    }
  }

  _addMarker(strike) {
    const age = Date.now() - strike.time;
    const st  = strikeStyle(age);
    strike.marker = L.circleMarker([strike.lat, strike.lon], {
      radius:      st.r,
      fillColor:   st.fill,
      color:       st.color,
      weight:      1,
      fillOpacity: st.opacity,
      opacity:     st.opacity,
    }).addTo(this.layer);

    // Kratka animacija — poveča in izgine
    const el = strike.marker.getElement?.();
    if (el) {
      el.style.transition = 'transform 0.4s ease, opacity 0.4s ease';
      el.style.transform  = 'scale(2.5)';
      el.style.opacity    = '0.6';
      setTimeout(() => {
        el.style.transform = 'scale(1)';
        el.style.opacity   = String(st.opacity);
      }, 50);
    }
  }

  _purgeOld() {
    const cutoff = Date.now() - MAX_AGE_MS;
    this.strikes = this.strikes.filter((s) => {
      if (s.time < cutoff) {
        if (s.marker) this.layer.removeLayer(s.marker);
        return false;
      }
      return true;
    });
    this.onUpdate();
  }

  /** Posodobi barve obstoječih markerjev glede na starost */
  refreshColors() {
    for (const s of this.strikes) {
      if (!s.marker) continue;
      const age = Date.now() - s.time;
      const st  = strikeStyle(age);
      s.marker.setStyle({
        radius:      st.r,
        fillColor:   st.fill,
        color:       st.color,
        fillOpacity: st.opacity,
        opacity:     st.opacity,
      });
    }
  }

  /** Najbližja strela postaji */
  nearest() {
    let best = null, bestDist = Infinity;
    for (const s of this.strikes) {
      const d = haversine(STATION_LAT, STATION_LON, s.lat, s.lon);
      if (d < bestDist) { bestDist = d; best = s; }
    }
    return best ? { ...best, km: Math.round(bestDist) } : null;
  }

  /** Statistike za prikaz */
  stats() {
    const now   = Date.now();
    const h1    = this.strikes.filter((s) => now - s.time <  60 * 60_000).length;
    const m15   = this.strikes.filter((s) => now - s.time <  15 * 60_000).length;
    const m5    = this.strikes.filter((s) => now - s.time <   5 * 60_000).length;
    const near  = this.nearest();

    return {
      connected: this.connected,
      total60:   h1,
      total15:   m15,
      total5:    m5,
      nearest:   near,
    };
  }
}
