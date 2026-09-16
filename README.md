# Futbal Tipy – webová verzia (aj pre telefón)

Rovnaká štatistická analýza futbalových zápasov ako v desktopovej appke
(Poissonov gólový model + forma + vzájomné zápasy, dáta z
**football-data.org**), ale teraz ako webová stránka. Dá sa hostovať
online a otvoriť z telefónu, tabletu aj počítača cez bežný prehliadač.

## Rozdiel oproti desktopovej (Electron) verzii

- Appka beží ako **Node.js server** (Express), nie ako samostatný program
  na počítači.
- API kľúč sa **nezadáva v appke**, ale nastaví sa raz ako premenná
  prostredia na serveri (`FOOTBALL_DATA_API_KEY`) – bezpečnejšie, keďže
  appka je teraz prístupná cez internet.
- Frontend je čisté HTML/CSS/JS (žiadny build krok na strane prehliadača),
  responzívny – na užšej obrazovke (telefón) sa filtre schovajú pod
  tlačidlo „Filtre“, na širšej (tablet/počítač) sú vždy viditeľné vľavo.

## 1. Lokálne spustenie (na vyskúšanie pred nasadením)

Potrebuješ [Node.js](https://nodejs.org) 18+.

```bash
cd football-tips-web
npm install
cp .env.example .env
```

Otvor `.env` a vlož svoj kľúč z football-data.org do `FOOTBALL_DATA_API_KEY`.

```bash
npm run dev
```

Appka pobeží na `http://localhost:3000` – over si ju v prehliadači na
počítači. Pre test z telefónu na rovnakej WiFi zisti lokálnu IP adresu
počítača (napr. `ipconfig getifaddr en0` na macOS) a v telefóne otvor
`http://TÁTO_IP:3000`.

## 2. Nasadenie online (Render.com, zadarmo)

Aby appka fungovala z telefónu **kdekoľvek** (nielen doma na WiFi), treba
ju nahrať na hosting. Render.com má bezplatný plán (Free Web Service),
ktorý na toto úplne stačí.

### Postup

1. **Nahraj projekt na GitHub** (ak tam ešte nie je) – vytvor nové
   repo a nahraj doň celý priečinok `football-tips-web`.
2. Zaregistruj sa na [render.com](https://render.com) (dá sa aj cez GitHub
   účet).
3. Klikni na **New → Web Service** a vyber svoje GitHub repo.
4. Nastav:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Plan:** Free
5. V sekcii **Environment** pridaj premenné:
   - `FOOTBALL_DATA_API_KEY` = tvoj kľúč z football-data.org
   - (voliteľné) `APP_USER` a `APP_PASSWORD` – ak chceš appku chrániť
     heslom, aby ju nepoužíval hocikto s odkazom a nevyčerpal ti denný
     limit požiadaviek
6. Klikni **Create Web Service**. Render appku zostaví a spustí – po
   pár minútach dostaneš verejnú adresu typu
   `https://futbal-tipy.onrender.com`.
7. Otvor túto adresu v telefóne (v ľubovoľnej mobilnej dátovej sieti, nie
   len doma na WiFi) – appka by mala fungovať rovnako ako na počítači.

### Poznámka k bezplatnému Render plánu

Free Web Service na Renderi sa po ~15 minútach nečinnosti "uspí" a prvé
ďalšie otvorenie appky potom trvá o niečo dlhšie (appka sa musí prebudiť).
Pre osobné používanie to zvyčajne vôbec nevadí.

## Bezpečnosť API kľúča

Kľúč je teraz len na serveri (v premennej prostredia), nikdy sa neposiela
do prehliadača ani do telefónu – to je aj dôvod, prečo appka už nemá
"Nastavenia API kľúča" ako predtým v Electron verzii.

## Štruktúra projektu

```
src/
  server.ts       # Express server + API endpointy (/api/leagues, /api/fixtures, /api/analyze)
  apiClient.ts     # volania na football-data.org (kľúč z process.env)
  predictor.ts     # rovnaký štatistický model ako v desktopovej appke
  types.ts         # zdieľané TypeScript typy
public/
  index.html       # mobil-friendly UI
  style.css        # responzívny dizajn (mobil aj desktop)
  app.js           # frontend logika (fetch na vlastný server)
```

## Zodpovedné stávkovanie

Táto appka je analytický nástroj, nie odporúčanie stávkovať. Ak sa
rozhodneš stávkovať, rob tak len s peniazmi, o ktoré si môžeš dovoliť
prísť, a stanov si vopred limity.
