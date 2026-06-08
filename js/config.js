/** Povečaj ob večjih popravkih – počisti star predpomnilnik v brskalniku */
export const APP_VERSION = '13';

/** Google Sheets – javno dostopen list (Kdorkoli s povezavo / objavljen na spletu). */
export const SHEET = {
  id: '1xIQOh1zIYKPL-nM7nsWve_OllwkwLZxNTGDRN0Dfv-E',
  /** Glavni urniki meritev 2026 (Stationid, Temp, …) */
  dataGid: '0',
  /** Povzetek: trenutna T, Tmin, Tmax */
  summaryGid: '1383559631',
};

/** Zavihek po letu – vsako leto ima svoj list v delovnem zvezku */
export const YEAR_SHEETS = {
  2026: 'Sheet1',
  2025: '2025 data',
  2024: '2024data',
  2023: '2023 -data',
  2022: '2022 - data',
};

export const REFRESH_MS = 5 * 60 * 1000;

export const RANGES = {
  /** Zadnjih 72 ur (3 dni) za grafe */
  recentHours: 72,
  /** Zadnjih 7 dni za dnevni pregled */
  recentDays: 7,
};
