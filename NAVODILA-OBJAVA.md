# Objava PWA na splet (GitHub Pages)

Po objavi aplikacija deluje na telefonu **brez** `zagon.bat` in brez vklopljenega računalnika.

Potrebujete: brezen GitHub račun, internet.

---

## 1. Nov repozitorij na GitHub

1. Odprite https://github.com/new  
2. Ime npr. **`vreme-koper`** (poljubno)  
3. **Public**  
4. Brez README / brez .gitignore (že imate v projektu)  
5. **Create repository**

---

## 2. Naložite kodo iz računalnika

V **PowerShell** (zamenjajte `VAS_UPORABNIK` in `vreme-koper`):

```powershell
cd e:\Projekti\Vreme\pwa

git init
git add .
git commit -m "Vreme Koper PWA"
git branch -M main
git remote add origin https://github.com/VAS_UPORABNIK/vreme-koper.git
git push -u origin main
```

Če GitHub vpraša za prijavo, uporabite **Personal Access Token** (ne geslo).

---

## 3. Vklopite GitHub Pages

1. Na GitHubu: repozitorij → **Settings** → **Pages**  
2. Pod **Build and deployment** → Source: **GitHub Actions**  
3. Po `git push` pojdi na zavihek **Actions** – workflow **Objavi na GitHub Pages** mora biti zelen  

Čez 1–2 minuti je stran na:

```
https://VAS_UPORABNIK.github.io/vreme-koper/
```

(Zgodovina: `.../history.html`)

---

## 4. Namestitev na telefon

1. Odprite zgornji URL v **Chrome** (Android) ali **Safari** (iPhone)  
2. **Dodaj na začetni zaslon** / **Namesti aplikacijo**  
3. Google Sheet mora ostati javen: *Kdorkoli s povezavo → Ogledovalec*

---

## Posodobitve

Ko spremenite kodo lokalno:

```powershell
cd e:\Projekti\Vreme\pwa
git add .
git commit -m "Posodobitev"
git push
```

GitHub Pages se posodobi sam (1–2 min).

---

## Lokalno testiranje (opcijsko)

Dvojni klik **`zagon.bat`** ali `npx serve -l 3456 .`
