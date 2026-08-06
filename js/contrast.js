/**
 * Sončni / visokokontrastni način – boljša berljivost na soncu.
 * Stanje v localStorage: vreme-contrast = 'high' | 'normal'
 */

const KEY = 'vreme-contrast';

export function getContrast() {
  try {
    return localStorage.getItem(KEY) === 'high' ? 'high' : 'normal';
  } catch {
    return 'normal';
  }
}

export function applyContrast(mode) {
  const high = mode === 'high';
  document.documentElement.dataset.contrast = high ? 'high' : '';
  if (!high) delete document.documentElement.dataset.contrast;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = high ? '#f1f5f9' : '#070f1a';

  document.querySelectorAll('[data-contrast-toggle]').forEach((btn) => {
    btn.setAttribute('aria-pressed', high ? 'true' : 'false');
    btn.title = high ? 'Običajni kontrast' : 'Sončni kontrast';
    btn.setAttribute('aria-label', high ? 'Običajni kontrast' : 'Sončni kontrast');
  });
}

export function toggleContrast() {
  const next = getContrast() === 'high' ? 'normal' : 'high';
  try {
    localStorage.setItem(KEY, next);
  } catch { /* ignore */ }
  applyContrast(next);
  return next;
}

/** Pokliči ob zagonu strani; poveže vse gumbe [data-contrast-toggle]. */
export function initContrast() {
  applyContrast(getContrast());
  document.querySelectorAll('[data-contrast-toggle]').forEach((btn) => {
    if (btn.dataset.contrastBound) return;
    btn.dataset.contrastBound = '1';
    btn.addEventListener('click', () => toggleContrast());
  });
}

// Takoj ob uvozu (zmanjša utrip, če ni inline skripte)
applyContrast(getContrast());
