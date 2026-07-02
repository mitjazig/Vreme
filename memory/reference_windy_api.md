---
name: reference-windy-api
description: Windy Point Forecast API key and working models for this project
metadata:
  type: reference
---

Windy Point Forecast API key: `58UhOvksR2vlquJJOYKnpoCAAfgscf9e`
Endpoint: `POST https://api.windy.com/api/point-forecast/v2`

Working models (free plan):
- `gfs` — wind (u/v), windGust, temp (Kelvin), precip, rh at surface/950h/850h
- `gfsWave` — waves_height (m), waves_direction (deg), waves_period (s) at surface

ECMWF is NOT available on free plan.

Used for: wave forecast card on Postaja (forecast.html) tab.
