const $ = (sel) => document.querySelector(sel);

export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

export function isIOS() {
  return /iPad|iPhone|iPod/i.test(navigator.userAgent);
}

export function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

function ensureModal() {
  if ($('#install-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'install-modal';
  modal.className = 'install-modal hidden';
  modal.innerHTML = `
    <div class="install-modal__backdrop" data-close></div>
    <div class="install-modal__panel" role="dialog" aria-labelledby="install-modal-title">
      <button type="button" class="install-modal__close" data-close aria-label="Zapri">×</button>
      <h2 id="install-modal-title" class="install-modal__title">Namestitev na telefon</h2>
      <div id="install-modal-body"></div>
    </div>`;
  document.body.appendChild(modal);

  modal.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', () => modal.classList.add('hidden'));
  });
}

function openModal(html) {
  ensureModal();
  const body = $('#install-modal-body');
  if (body) body.innerHTML = html;
  $('#install-modal')?.classList.remove('hidden');
}

const IOS_HTML = `
  <ol class="install-steps">
    <li>Odprite stran v brskalniku <strong>Safari</strong> (ne v Chrome na iPhonu).</li>
    <li>Tapnite ikono <strong>Deli</strong> <span class="install-icon">□↑</span> spodaj.</li>
    <li>Izberite <strong>Dodaj na začetni zaslon</strong>.</li>
    <li>Potrdite z <strong>Dodaj</strong>.</li>
  </ol>`;

const ANDROID_HTML = `
  <ol class="install-steps">
    <li>Odprite stran v <strong>Chrome</strong>.</li>
    <li>Tapnite meni <strong>⋮</strong> zgoraj desno.</li>
    <li>Izberite <strong>Namesti aplikacijo</strong> ali <strong>Dodaj na začetni zaslon</strong>.</li>
  </ol>`;

const DESKTOP_HTML = `
  <ol class="install-steps">
    <li>V Chrome/Edge kliknite ikono namestitve v naslovni vrstici.</li>
    <li>Ali: meni → <strong>Namesti Vreme Koper</strong>.</li>
  </ol>`;

export function setupInstallUI() {
  if (isStandalone()) return;

  const btn = $('#btn-install');
  if (!btn) return;

  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btn.textContent = 'Namesti';
    btn.classList.remove('hidden');
  });

  btn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      btn.classList.add('hidden');
      return;
    }

    if (isIOS()) openModal(IOS_HTML);
    else if (isAndroid()) openModal(ANDROID_HTML);
    else openModal(DESKTOP_HTML);
  });

  // iOS nima beforeinstallprompt – vedno pokaži pomoč
  if (isIOS()) {
    btn.textContent = 'Namesti';
    btn.classList.remove('hidden');
    return;
  }

  // Android: če Chrome ne ponudi namestitve, še vedno pokaži navodila
  if (isAndroid()) {
    setTimeout(() => {
      if (!deferredPrompt) {
        btn.textContent = 'Namesti';
        btn.classList.remove('hidden');
      }
    }, 2500);
  }
}
