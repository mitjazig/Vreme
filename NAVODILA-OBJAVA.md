# Objava PWA na splet (GitHub Pages)

## 1. Naložite kodo (če še niste)

```powershell
cd E:\Projekti\Vreme\pwa
git add .
git commit -m "Posodobitev"
git push
```

---

## 2. Vklopite GitHub Pages (enkrat)

1. Odprite: **https://github.com/mitjazig/Vreme/settings/pages**
2. **Build and deployment** → **Source**: **Deploy from a branch**
3. **Branch**: `gh-pages` · mapa **`/ (root)`**
4. Kliknite **Save**

> Repozitorij mora biti **Public** (brezplačni GitHub Pages).

---

## 3. Zaženite workflow

Po `git push` gre na **Actions** → **Objavi na GitHub Pages**.

Prvi uspešen zagon ustvari vejo `gh-pages`. Čez 1–2 minuti je stran na:

**https://mitjazig.github.io/Vreme/**

Zgodovina: **https://mitjazig.github.io/Vreme/history.html**

---

## 4. Telefon

Odprite URL v Chrome/Safari → **Dodaj na začetni zaslon**.

Google Sheet: *Kdorkoli s povezavo → Ogledovalec*.

---

## Težave?

| Težava | Rešitev |
|--------|---------|
| Actions rdeče | Preberite log; ponovno **Run workflow** |
| 404 na URL | Počakajte 2 min; preverite Settings → Pages (veja `gh-pages`) |
| Prazna stran | Osvežite s Ctrl+Shift+R |
