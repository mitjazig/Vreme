/**
 * Skupna navigacija: weather chip, opozorilni indikator, scroll na #anker.
 */
import { loadWeatherContext, formatContextChip } from './weather-context.js';

function pageKeyFromPath() {
  const path = (location.pathname || '').replace(/\\/g, '/');
  const file = path.split('/').pop() || '';
  if (!file || file === 'index.html') return 'home';
  if (file.startsWith('forecast')) return 'forecast';
  if (file.startsWith('history') || file.startsWith('records')) return 'forecast';
  if (file.startsWith('lokacija')) return 'lokacija';
  if (file.startsWith('postaje')) return 'postaje';
  if (file.startsWith('sreca')) return 'sreca';
  return 'other';
}

function ensureContextChip() {
  const key = pageKeyFromPath();
  if (key === 'home') return;

  const header = document.querySelector('.header');
  if (!header || header.querySelector('.wx-chip')) return;

  const ctx = loadWeatherContext();
  const text = formatContextChip(ctx);
  if (!text) return;

  const chip = document.createElement('a');
  chip.className = 'wx-chip';
  chip.href = './';
  chip.title = 'Nazaj na trenutno vreme v Kopru';
  chip.setAttribute('aria-label', `Koper: ${text}`);

  const alertCount = ctx?.alertCount > 0 ? ctx.alertCount : 0;
  chip.innerHTML = `<span class="wx-chip__main">${text}</span>${
    alertCount
      ? `<a class="wx-chip__alert" href="./forecast.html#sec-alerts" aria-label="${alertCount} opozoril">⚠ ${alertCount}</a>`
      : ''
  }`;

  // Nested <a> is invalid — rebuild as span + separate alert link
  chip.innerHTML = '';
  const main = document.createElement('span');
  main.className = 'wx-chip__main';
  main.textContent = text;
  chip.appendChild(main);

  header.insertBefore(chip, header.querySelector('.header__actions'));

  if (alertCount) {
    const alert = document.createElement('a');
    alert.className = 'wx-chip__alert';
    alert.href = './forecast.html#sec-alerts';
    const label = alertCount === 1 ? '1 opozorilo' : `${alertCount} opozorili`;
    alert.setAttribute('aria-label', label);
    alert.textContent = `⚠ ${alertCount}`;
    alert.title = label;
    header.insertBefore(alert, header.querySelector('.header__actions'));
  }
}

function highlightJumpNav() {
  const jump = document.querySelector('.page-jump');
  if (!jump) return;
  const links = [...jump.querySelectorAll('a[href^="#"]')];
  const sections = links
    .map((a) => document.getElementById(a.getAttribute('href').slice(1)))
    .filter(Boolean);

  if (!sections.length || !('IntersectionObserver' in window)) return;

  const io = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const id = visible.target.id;
      links.forEach((a) => {
        a.classList.toggle('page-jump__link--active', a.getAttribute('href') === `#${id}`);
      });
    },
    { rootMargin: '-20% 0px -55% 0px', threshold: [0.1, 0.35] },
  );
  sections.forEach((s) => io.observe(s));
}

function scrollToHash() {
  if (!location.hash || location.hash.length < 2) return;
  const el = document.getElementById(location.hash.slice(1));
  if (!el) return;
  requestAnimationFrame(() => {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

export function initSiteNav() {
  ensureContextChip();
  highlightJumpNav();
  scrollToHash();
  window.addEventListener('hashchange', scrollToHash);
}

// Auto-init on import (pages that import this module)
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSiteNav);
  } else {
    initSiteNav();
  }
}
