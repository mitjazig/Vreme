/**
 * notifications.js – lokalna push obvestila za vremenske alarme
 * Brez push strežnika: obvestila se prikažejo ob nalaganju app-a ko so aktivni alarmi.
 */

const NOTIF_STORAGE_KEY = 'vreme-notif-seen-v1';
const NOTIF_PERMISSION_ASKED = 'vreme-notif-asked';

function getSeenAlerts() {
  try { return JSON.parse(localStorage.getItem(NOTIF_STORAGE_KEY) ?? '[]'); } catch { return []; }
}

function saveSeenAlerts(keys) {
  try { localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(keys.slice(-20))); } catch {}
}

function alertKey(w) {
  return `${w.title}-${w.desc}-${w.level}`;
}

/** Prikaži gumb za dovoljenje obvestil */
export function renderNotifButton() {
  // Samo če browser podpira in dovoljenje ni že podeljeno
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') return;
  if (localStorage.getItem(NOTIF_PERMISSION_ASKED)) return;

  const btn = document.createElement('button');
  btn.className = 'notif-ask-btn';
  btn.textContent = '🔔 Dovoli obvestila o alarmih';
  btn.addEventListener('click', async () => {
    localStorage.setItem(NOTIF_PERMISSION_ASKED, '1');
    btn.remove();
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      new Notification('Vreme Koper', {
        body: 'Obvestila o vremenskih alarmih so vklopljena.',
        icon: '/icons/icon-192.png',
      });
    }
  });

  // Vstavi pod status bar
  const status = document.getElementById('status');
  if (status) status.after(btn);
}

/** Pošlji obvestilo za aktivne alarme (kliče se po fetchWarnings) */
export function notifyWarnings(warnings) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (!warnings?.length) return;

  const seen = getSeenAlerts();
  const newWarnings = warnings.filter((w) => {
    const key = alertKey(w);
    return !seen.includes(key);
  });

  if (!newWarnings.length) return;

  // Skupaj v eno obvestilo
  const redOrange = newWarnings.filter((w) => w.level === 'red' || w.level === 'orange');
  const toShow = redOrange.length ? redOrange : newWarnings;

  const title = toShow.length === 1
    ? `⚠️ ${toShow[0].title}`
    : `⚠️ ${toShow.length} vremenski alarmi`;

  const body = toShow.map((w) => `${w.icon} ${w.desc}`).join('\n');

  try {
    new Notification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'vreme-alarm',
      renotify: true,
    });
  } catch {}

  // Označi vse kot videne
  const allKeys = [...seen, ...newWarnings.map(alertKey)];
  saveSeenAlerts(allKeys);
}

/** Inicializacija — pokliči enkrat ob zagonu */
export function initNotifications() {
  if (!('Notification' in window)) return;
  // Pokaži gumb šele po kratki zamudi (da ne moti začetnega nalaganja)
  setTimeout(renderNotifButton, 3000);
}
