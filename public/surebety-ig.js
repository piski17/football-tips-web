/* Surebety – obrázky na Instagram (12. 11. 2026, Michal: projekt pre zahraničných klientov, všetko po anglicky).
 * Kreslí sa na <canvas> priamo v prehliadači: príspevok 1080×1350 (4:5) a príbeh 1080×1920 (9:16).
 * Druhy: surebet pred zápasom, vyhodnotený surebet (skóre + ktorá strana vyšla), súhrn dňa.
 * Farby Kameň ako web (teplý grafit, béžový kameň, zisk šalviový). */
(function () {
  const C = {
    bg: "#0E0D0C", card: "#1C1B19", card2: "#252320", line: "rgba(207,196,180,.22)",
    text: "#F2EFEA", muted: "#A39E96", faint: "#6E6A64", stone: "#CFC4B4", good: "#7FC8A0", goodBg: "rgba(127,200,160,.12)",
  };
  const H_FONT = "Urbanist", B_FONT = "Manrope";

  // ---------- Preklad do angličtiny ----------
  const MARKET_EN = {
    "Góly v zápase": "Total goals", "Góly v 1. polčase": "1st half goals", "Góly v 2. polčase": "2nd half goals",
    "Víťaz bez remízy": "Draw no bet", "Oba tímy skórujú": "Both teams to score",
    "Oba tímy skórujú v 1. polčase": "Both teams to score – 1st half", "Oba tímy skórujú v 2. polčase": "Both teams to score – 2nd half",
    "Párny / nepárny počet gólov": "Odd / even goals", "Rohy v zápase": "Total corners", "Karty v zápase": "Total cards",
    "Góly domácich": "Home team goals", "Góly hostí": "Away team goals", "Rohy domácich": "Home team corners", "Rohy hostí": "Away team corners",
    "Rohy v 1. polčase": "1st half corners", "Rohy v 2. polčase": "2nd half corners", "Karty domácich": "Home team cards", "Karty hostí": "Away team cards",
    "Karty v 1. polčase": "1st half cards", "Góly domácich v 1. polčase": "Home goals – 1st half", "Góly hostí v 1. polčase": "Away goals – 1st half",
  };
  const COUNTRY_EN = {
    "Anglicko": "England", "Španielsko": "Spain", "Taliansko": "Italy", "Nemecko": "Germany", "Francúzsko": "France", "Holandsko": "Netherlands",
    "Portugalsko": "Portugal", "Belgicko": "Belgium", "Turecko": "Turkey", "Dánsko": "Denmark", "Škótsko": "Scotland", "Európa": "Europe",
    "Svet": "World", "Rakúsko": "Austria", "Švajčiarsko": "Switzerland", "Grécko": "Greece", "Česko": "Czechia", "Slovensko": "Slovakia", "Poľsko": "Poland",
  };
  const market = (m) => MARKET_EN[m] || m;
  function label(l) {
    let m = /^Nad\s+([\d,.]+)$/i.exec(l); if (m) return "Over " + m[1].replace(",", ".");
    m = /^Pod\s+([\d,.]+)$/i.exec(l); if (m) return "Under " + m[1].replace(",", ".");
    return { "Áno": "Yes", "Nie": "No", "Nepárny": "Odd", "Párny": "Even" }[l] || l;
  }
  const league = (s) => s.league + (s.country && COUNTRY_EN[s.country] ? " · " + COUNTRY_EN[s.country] : s.country ? " · " + s.country : "");
  const n2 = (x) => x.toFixed(2);
  const kickoff = (iso) => {
    const d = new Date(iso);
    const day = d.toLocaleDateString("en-GB", { timeZone: "Europe/Bratislava", weekday: "short", day: "numeric", month: "short" });
    const t = d.toLocaleTimeString("en-GB", { timeZone: "Europe/Bratislava", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
    return day + " · " + t;
  };
  const dayEn = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  // ---------- Vyhodnotenie strany z výsledku ----------
  /** 0 / 1 = vyhrala strana, -1 = vrátenie vkladov (remíza pri „bez remízy“), null = nevieme. */
  function winner(s, r) {
    if (!r || !r.finished) return null;
    const g = r.goals, h = r.halftime, co = r.corners, ca = r.cards;
    const sum = (a, b) => (a === null || b === null ? null : a + b);
    const val = {
      "Góly v zápase": sum(g.home, g.away), "Góly v 1. polčase": sum(h.home, h.away),
      "Góly v 2. polčase": sum(g.home, g.away) === null || sum(h.home, h.away) === null ? null : sum(g.home, g.away) - sum(h.home, h.away),
      "Góly domácich": g.home, "Góly hostí": g.away, "Góly domácich v 1. polčase": h.home, "Góly hostí v 1. polčase": h.away,
      "Rohy v zápase": sum(co.home, co.away), "Rohy domácich": co.home, "Rohy hostí": co.away,
      "Karty v zápase": sum(ca.home, ca.away), "Karty domácich": ca.home, "Karty hostí": ca.away,
    }[s.market];
    const test = (lab) => {
      const L = label(lab);
      let m = /^Over ([\d.]+)$/.exec(L); if (m && val !== undefined && val !== null) return val > Number(m[1]);
      m = /^Under ([\d.]+)$/.exec(L); if (m && val !== undefined && val !== null) return val < Number(m[1]);
      if (g.home === null || g.away === null) return null;
      if (/^Both teams to score/.test(market(s.market))) {
        let a = g.home, b = g.away;
        if (/1st half/.test(market(s.market))) { if (h.home === null) return null; a = h.home; b = h.away; }
        if (/2nd half/.test(market(s.market))) { if (h.home === null) return null; a = g.home - h.home; b = g.away - h.away; }
        const yes = a > 0 && b > 0;
        return L === "Yes" ? yes : L === "No" ? !yes : null;
      }
      if (s.market === "Párny / nepárny počet gólov") { const odd = (g.home + g.away) % 2 === 1; return L === "Odd" ? odd : L === "Even" ? !odd : null; }
      if (s.market === "Víťaz bez remízy") {
        if (g.home === g.away) return "void";
        const homeWon = g.home > g.away;
        return lab === s.home ? homeWon : lab === s.away ? !homeWon : null;
      }
      return null;
    };
    const a = test(s.sides[0].label), b = test(s.sides[1].label);
    if (a === "void" || b === "void") return -1;
    if (a === true) return 0;
    if (b === true) return 1;
    return null;
  }

  // ---------- Kreslenie ----------
  function font(w, size, fam) { return `${w} ${size}px "${fam}", system-ui, sans-serif`; }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  function fit(ctx, text, w, size, maxW, fam, min = 28) {
    let sz = size;
    ctx.font = font(w, sz, fam);
    while (ctx.measureText(text).width > maxW && sz > min) { sz -= 2; ctx.font = font(w, sz, fam); }
    return sz;
  }
  function spaced(ctx, text, x, y, sp, align = "left") {
    const chars = [...text];
    const total = chars.reduce((t, c) => t + ctx.measureText(c).width, 0) + sp * (chars.length - 1);
    let cx = align === "right" ? x - total : align === "center" ? x - total / 2 : x;
    const prev = ctx.textAlign; ctx.textAlign = "left";
    for (const c of chars) { ctx.fillText(c, cx, y); cx += ctx.measureText(c).width + sp; }
    ctx.textAlign = prev;
    return total;
  }
  function background(ctx, W, H) {
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W * 0.85, H * 0.05, 0, W * 0.85, H * 0.05, W * 0.9);
    g.addColorStop(0, "rgba(207,196,180,.13)"); g.addColorStop(1, "rgba(207,196,180,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const g2 = ctx.createRadialGradient(0, H, 0, 0, H, W * 0.8);
    g2.addColorStop(0, "rgba(127,200,160,.08)"); g2.addColorStop(1, "rgba(127,200,160,0)");
    ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
  }
  function header(ctx, W, y, tag, tagColor) {
    const X = 72;
    // Značka ARBREX (12. 11. 2026, Michal) – kruh s dvoma opačnými šípkami (Over zelená, Under kameň = obe strany kryté)
    const mx = X + 20, my = y - 12, mr = 20;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = C.stone; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 3.6;
    ctx.strokeStyle = C.good; ctx.beginPath(); ctx.moveTo(mx - 5, my + 11); ctx.lineTo(mx - 5, my - 9); ctx.moveTo(mx - 11, my - 3); ctx.lineTo(mx - 5, my - 10); ctx.lineTo(mx + 1, my - 3); ctx.stroke();
    ctx.strokeStyle = C.stone; ctx.beginPath(); ctx.moveTo(mx + 5, my - 11); ctx.lineTo(mx + 5, my + 9); ctx.moveTo(mx - 1, my + 3); ctx.lineTo(mx + 5, my + 10); ctx.lineTo(mx + 11, my + 3); ctx.stroke();
    ctx.lineCap = "butt"; ctx.lineJoin = "miter";
    ctx.fillStyle = C.text; ctx.font = font(800, 40, H_FONT); ctx.textBaseline = "alphabetic";
    spaced(ctx, "ARBREX", X + 54, y + 2, 6);
    ctx.font = font(700, 13, B_FONT);
    ctx.fillStyle = C.muted; const pw0 = spaced(ctx, "PROFIT. ", X + 56, y + 24, 3.5);
    ctx.fillStyle = C.good; spaced(ctx, "WHATEVER THE SCORE.", X + 56 + pw0 + 6, y + 24, 3.5);
    // Štítok vpravo
    ctx.font = font(800, 24, B_FONT);
    const tw = ctx.measureText(tag).width + tag.length * 3 + 44;
    rr(ctx, W - X - tw, y - 40, tw, 54, 27);
    ctx.fillStyle = tagColor === "good" ? C.good : C.stone; ctx.fill();
    ctx.fillStyle = C.bg; spaced(ctx, tag, W - X - tw / 2, y - 4, 3, "center");
  }
  function footer(ctx, W, y, handle) {
    const X = 72;
    ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X, y - 46); ctx.lineTo(W - X, y - 46); ctx.stroke();
    ctx.fillStyle = C.stone; ctx.font = font(700, 28, B_FONT); ctx.textAlign = "left"; ctx.fillText(handle || "", X, y);
    ctx.fillStyle = C.faint; ctx.font = font(500, 22, B_FONT); ctx.textAlign = "right";
    ctx.fillText("Odds at the time of posting · 18+ · Bet responsibly", W - X, y);
    ctx.textAlign = "left";
  }

  /** Surebet (pred zápasom alebo vyhodnotený). */
  function drawSurebet(s, fmtKey, result, handle) {
    const W = 1080, H = fmtKey === "story" ? 1920 : 1350, story = fmtKey === "story";
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    const X = 72, IW = W - 2 * X;
    const win = result ? winner(s, result) : null;
    const settled = !!result;
    background(ctx, W, H);
    let y = story ? 220 : 112;
    header(ctx, W, y, settled ? "SETTLED ✓" : "SUREBET", settled ? "good" : "stone");
    y += story ? 110 : 82;

    // Súťaž
    ctx.fillStyle = C.muted; ctx.font = font(700, 24, B_FONT);
    spaced(ctx, league(s).toUpperCase(), X, y, 2.5);
    y += story ? 92 : 78;
    // Tímy
    const home = s.home, away = s.away;
    const tsz = Math.min(fit(ctx, home, 800, story ? 84 : 70, IW, H_FONT), fit(ctx, away, 800, story ? 84 : 70, IW, H_FONT));
    ctx.font = font(800, tsz, H_FONT); ctx.fillStyle = C.text; ctx.fillText(home, X, y);
    if (story) {
      y += tsz * 0.82;
      ctx.font = font(600, 30, B_FONT); ctx.fillStyle = C.stone; ctx.fillText("vs", X, y);
      y += tsz * 1.0;
      ctx.font = font(800, tsz, H_FONT); ctx.fillStyle = C.text; ctx.fillText(away, X, y);
      y += 70;
    } else {
      // Príspevok: „vs Hostia“ v druhom riadku – viac miesta na ďalšie dvojice stávkoviek
      y += tsz * 1.05;
      ctx.font = font(600, 30, B_FONT); ctx.fillStyle = C.stone; ctx.fillText("vs", X, y);
      const vw = ctx.measureText("vs  ").width;
      const asz = Math.min(tsz, fit(ctx, away, 800, tsz, IW - vw, H_FONT));
      ctx.font = font(800, asz, H_FONT); ctx.fillStyle = C.text; ctx.fillText(away, X + vw, y);
      y += 58;
    }
    // Čas alebo skóre
    ctx.font = font(600, 28, B_FONT);
    if (settled && result.goals.home !== null) {
      ctx.fillStyle = C.muted; ctx.fillText("FULL TIME", X, y);
      const lw = ctx.measureText("FULL TIME").width;
      ctx.font = font(800, 40, H_FONT); ctx.fillStyle = C.text;
      ctx.fillText(`${result.goals.home} : ${result.goals.away}`, X + lw + 22, y + 2);
    } else {
      ctx.fillStyle = C.muted; ctx.fillText(kickoff(s.date), X, y);
    }
    y += story ? 80 : 64;

    // Trh
    ctx.font = font(700, 26, B_FONT);
    const mk = market(s.market);
    const mw = ctx.measureText(mk).width + 48;
    rr(ctx, X, y - 38, mw, 54, 27); ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = C.stone; ctx.fillText(mk, X + 24, y - 2);
    y += story ? 56 : 40;

    // Dve stávky
    const sum = 1 / s.sides[0].odd + 1 / s.sides[1].odd;
    const gap = 24, cw = (IW - gap) / 2, ch = story ? 340 : 274;
    s.sides.forEach((sd, k) => {
      const cx = X + k * (cw + gap);
      const won = win === k, lost = win !== null && win !== -1 && win !== k;
      rr(ctx, cx, y, cw, ch, 28);
      ctx.fillStyle = won ? C.goodBg : C.card; ctx.fill();
      ctx.strokeStyle = won ? C.good : C.line; ctx.lineWidth = won ? 4 : 2; ctx.stroke();
      ctx.globalAlpha = lost ? 0.45 : 1;
      let iy = y + (story ? 58 : 50);
      ctx.fillStyle = C.muted; ctx.font = font(700, 22, B_FONT); spaced(ctx, ("BET " + (k + 1)).toUpperCase(), cx + 30, iy, 3);
      if (won || lost || win === -1) {
        const t = won ? "WON ✓" : lost ? "LOST" : "VOID";
        ctx.font = font(800, 22, B_FONT); ctx.fillStyle = won ? C.good : C.muted; ctx.textAlign = "right"; ctx.fillText(t, cx + cw - 30, iy); ctx.textAlign = "left";
      }
      iy += story ? 54 : 48;
      const lb = `${market(s.market)} - ${label(sd.label)}`; // Michal 13. 11.: trh a tip spolu, rovnako veľké a hrubé
      const lsz = fit(ctx, lb, 800, 44, cw - 60, H_FONT, 22);
      ctx.font = font(800, lsz, H_FONT); ctx.fillStyle = C.text; ctx.fillText(lb, cx + 30, iy);
      iy += story ? 96 : 78;
      ctx.font = font(800, story ? 96 : 80, H_FONT); ctx.fillStyle = won ? C.good : C.stone; ctx.fillText(n2(sd.odd), cx + 28, iy);
      iy += story ? 50 : 42;
      ctx.font = font(700, 28, B_FONT); ctx.fillStyle = C.text;
      const bk = "at " + sd.book; fit(ctx, bk, 700, 28, cw - 60, B_FONT, 18); ctx.fillText(bk, cx + 30, iy);
      iy += story ? 46 : 36;
      const stake = (100 * (1 / sd.odd)) / sum;
      ctx.font = font(600, 24, B_FONT); ctx.fillStyle = C.muted; ctx.fillText(`Stake €${n2(stake)}`, cx + 30, iy);
      ctx.globalAlpha = 1;
    });
    y += ch + (story ? 64 : 46);

    // Ďalšie dvojice stávkoviek s tým istým surebetom (12. 11. 2026, Michal: v ktorej stávkovke a za aký kurz stranu 1, v ktorej stranu 2)
    const footY = story ? H - 160 : H - 60;
    const bh = story ? 240 : 150;
    const boxTop = footY - 46 - 36 - bh;
    const combos = window.sbCombos ? window.sbCombos(s) : [];
    if (combos.length) {
      const rowH = story ? 46 : 34, headH = story ? 86 : 72;
      const fitRows = Math.max(1, Math.floor((boxTop - 16 - y - headH) / rowH));
      const more = combos.length > fitRows;
      const rows = combos.slice(0, more ? Math.max(1, fitRows - 1) : fitRows);
      ctx.font = font(700, 22, B_FONT); ctx.fillStyle = C.stone;
      spaced(ctx, "THE SAME SUREBET ALSO WORKS HERE", X, y, 2.5);
      y += story ? 46 : 40;
      const c2 = X + IW * 0.43;
      ctx.font = font(700, 20, B_FONT); ctx.fillStyle = C.faint;
      spaced(ctx, label(s.sides[0].label).toUpperCase(), X, y, 2);
      spaced(ctx, label(s.sides[1].label).toUpperCase(), c2, y, 2);
      spaced(ctx, "PROFIT", X + IW, y, 2, "right");
      y += story ? 40 : 34;
      const cell = (o, x, maxW) => {
        ctx.font = font(700, story ? 28 : 24, B_FONT); ctx.fillStyle = C.text;
        let bk = o.book;
        while (ctx.measureText(bk + "  " + n2(o.odd)).width > maxW && bk.length > 4) bk = bk.slice(0, -2) + "…";
        ctx.fillText(bk, x, y);
        const w = ctx.measureText(bk + "  ").width;
        ctx.font = font(800, story ? 28 : 24, H_FONT); ctx.fillStyle = C.stone; ctx.fillText(n2(o.odd), x + w, y);
      };
      for (const p of rows) {
        cell(p.a, X, IW * 0.41);
        cell(p.b, c2, IW * 0.38);
        ctx.font = font(800, story ? 30 : 26, H_FONT); ctx.fillStyle = C.good; ctx.textAlign = "right";
        ctx.fillText(`+${n2(p.margin * 100)}%`, X + IW, y); ctx.textAlign = "left";
        y += rowH;
      }
      if (more) { ctx.font = font(600, 22, B_FONT); ctx.fillStyle = C.muted; ctx.fillText(`+ ${combos.length - rows.length} more combinations`, X, y); y += rowH; }
    }

    // Zisk
    const by = Math.max(y + 4, boxTop);
    rr(ctx, X, by, IW, bh, 30);
    const gg = ctx.createLinearGradient(X, by, X + IW, by + bh);
    gg.addColorStop(0, "rgba(127,200,160,.20)"); gg.addColorStop(1, "rgba(127,200,160,.06)");
    ctx.fillStyle = gg; ctx.fill(); ctx.strokeStyle = "rgba(127,200,160,.55)"; ctx.lineWidth = 2; ctx.stroke();
    const profit = 100 * s.margin;
    ctx.fillStyle = C.good; ctx.font = font(800, 24, B_FONT);
    spaced(ctx, settled ? (win === -1 ? "BOTH STAKES RETURNED" : "PROFIT LOCKED IN") : "GUARANTEED PROFIT", X + 40, by + (story ? 62 : 46), 3);
    ctx.font = font(800, story ? 116 : 76, H_FONT);
    const big = settled && win !== -1 ? `+€${n2(profit)}` : win === -1 ? "€0.00" : `+${n2(profit)}%`;
    ctx.fillText(big, X + 36, by + (story ? 168 : 118));
    const bw = ctx.measureText(big).width;
    ctx.font = font(600, story ? 28 : 24, B_FONT); ctx.fillStyle = C.text;
    const sub1 = settled ? (win === -1 ? "Draw – no bet: both stakes refunded" : `+${n2(profit)}% on €100 staked`) : `€${n2(profit)} on every €100 staked`;
    const sub2 = settled ? (win === -1 ? "No loss, no risk" : "Whatever the score") : "Whatever the score";
    if (story) {
      ctx.fillText(sub1, X + 40, by + 212);
      ctx.fillStyle = C.muted; ctx.textAlign = "right"; ctx.fillText(sub2, X + IW - 40, by + 212); ctx.textAlign = "left";
    } else {
      const tx = X + 36 + bw + 34;
      ctx.fillText(sub1, tx, by + 86);
      ctx.fillStyle = C.muted; ctx.fillText(sub2, tx, by + 120);
    }
    footer(ctx, W, footY, handle);
    return cv;
  }

  /** Súhrn dňa (vyhodnotenie skúšky). */
  /** 12. 11. 2026 (Michal): súhrn dňa na viac obrázkov – na každom najviac 5 (príbeh 8) surebetov, aby boli vidieť všetky. */
  // 13. 11. 2026 (Michal): každý zápas ako karta BET 1 / BET 2 (ako pri jednom surebete) → príspevok 2 na obrázok, príbeh 3.
  const CARD = { head: 48, pill: 56, gap: 8, bottom: 12, maxCombos: 2 };
  /** Rozdelenie zápasov na obrázky podľa výšky kariet (karta rastie o ďalšie dvojice), najviac 5 zápasov na obrázok. */
  function dayLayout(list, fmtKey) {
    const story = fmtKey === "story";
    const top = story ? 804 : 590; // y pod súčtami (rovnaké na každom obrázku)
    const avail = (story ? 1920 - 190 : 1350 - 60) - 46 - 10 - top;
    const gap = story ? 18 : 14;
    const pages = [[]]; let used = 0;
    pages.avail = avail; pages.gap = gap;
    for (const e of list) {
      const cb = dayCombos(e);
      const shown = cb.slice(0, CARD.maxCombos);
      const more = cb.length - shown.length;
      const h = CARD.head + CARD.pill + shown.length * (CARD.pill + CARD.gap) + (more ? 30 : 0) + CARD.bottom;
      let cur = pages[pages.length - 1];
      const need = (cur.length ? gap : 0) + h;
      if (cur.length && (cur.length >= 5 || used + need > avail)) { cur = []; pages.push(cur); used = 0; }
      used += (cur.length ? gap : 0) + h;
      cur.used = used;
      cur.push({ e, h, combos: shown, more });
    }
    return pages;
  }
  const dayPages = (list, fmtKey) => dayLayout(list, fmtKey).length;
  /** 13. 11. 2026 (Michal): ďalšie stávkovky, kde ten istý surebet funguje – aj v súhrne dňa. */
  const dayCombos = (e) => (window.sbCombos ? window.sbCombos({ ...e, margin: e.maxMargin }) : []);
  function alsoBooks(e, mainToo = false) {
    const main = new Set(e.sides.map((x) => x.book));
    const out = [];
    for (const c of dayCombos(e)) for (const b of [c.a.book, c.b.book]) if ((mainToo || !main.has(b)) && !out.includes(b)) out.push(b);
    return out;
  }
  /** Ďalšie stávkovky s kurzom pre každú stranu (ten istý surebet s pôvodnou druhou stranou). */
  const sideAlts = (e, i) => ((e.alts && e.alts[i]) || []).filter((o) => o.book !== e.sides[0].book && o.book !== e.sides[1].book);
  const altsText = (e, i, max = 99) => { const l = sideAlts(e, i); return l.slice(0, max).map((o) => `${o.book} ${n2(o.odd)}`).join(" · ") + (l.length > max ? ` +${l.length - max}` : ""); };
  const alsoLine = (e, max) => {
    const c = dayCombos(e);
    return c.length ? `Also: ${c.slice(0, Math.min(max, 2)).map((p) => `${p.a.book} ${n2(p.a.odd)} + ${p.b.book} ${n2(p.b.odd)} (+${n2(p.margin * 100)}%)`).join("  ·  ")}${c.length > 2 ? `  +${c.length - 2} more` : ""}` : "";
  };
  /** pre = true: dnešné surebety pred zápasmi (bez výsledku). */
  function drawDay(day, list, fmtKey, handle, page = 0, pre = false) {
    const W = 1080, H = fmtKey === "story" ? 1920 : 1350, story = fmtKey === "story";
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    const X = 72, IW = W - 2 * X;
    list = [...list].sort((a, b) => b.maxMargin - a.maxMargin);
    background(ctx, W, H);
    let y = story ? 220 : 112;
    header(ctx, W, y, pre ? "TODAY'S SUREBETS" : "DAILY RESULTS", pre ? "stone" : "good");
    y += story ? 130 : 100;
    ctx.fillStyle = C.text; ctx.font = font(800, story ? 96 : 84, H_FONT);
    ctx.fillText("Surebets", X, y); y += story ? 92 : 80;
    ctx.fillStyle = C.stone; ctx.fillText("of the day", X, y); y += story ? 72 : 62;
    ctx.fillStyle = C.muted; ctx.font = font(600, 28, B_FONT); ctx.fillText(dayEn(day), X, y);
    const pages = dayPages(list, fmtKey);
    if (pages > 1) { ctx.fillStyle = C.stone; ctx.font = font(800, 28, B_FONT); ctx.textAlign = "right"; ctx.fillText(`${page + 1} / ${pages}`, X + IW, y); ctx.textAlign = "left"; }
    y += story ? 70 : 50;
    const n = list.length;
    const avg = n ? list.reduce((t, e) => t + e.maxMargin, 0) / n : 0;
    const kp = [["SUREBETS", String(n)], ["AVG PROFIT", `+${n2(avg * 100)}%`], ["€100 ON EACH", `+€${n2(avg * 100 * n)}`]];
    const kw = (IW - 2 * 20) / 3, kh = story ? 170 : 150;
    kp.forEach(([t, v], i) => {
      const kx = X + i * (kw + 20);
      rr(ctx, kx, y, kw, kh, 24); ctx.fillStyle = i === 2 ? C.goodBg : C.card; ctx.fill();
      ctx.strokeStyle = i === 2 ? "rgba(127,200,160,.55)" : C.line; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = C.muted; ctx.font = font(700, 20, B_FONT); spaced(ctx, t, kx + 26, y + 48, 2);
      ctx.fillStyle = i === 2 ? C.good : C.text; fit(ctx, v, 800, story ? 64 : 58, kw - 48, H_FONT, 30); ctx.fillText(v, kx + 24, y + kh - 34);
    });
    y += kh + (story ? 50 : 36);
    // 13. 11. 2026 (Michal): pri málo surebetoch riadky zväčšiť, aby vyplnili obrázok (nie prázdna medzera dole).
    // 13. 11. 2026 (Michal): rovnaká karta pre každý zápas; ďalšie dvojice z iných stávkoviek hneď pod tým istým zápasom;
    // v kartičke stávky trh + tip, kurz, stávkovka a „Stake €…“. Strany sa delia podľa výšky (najviac 5 zápasov na obrázok).
    const lay = dayLayout(list, fmtKey);
    const rows = lay[page] || [];
    // 13. 11. 2026 (Michal): karty zväčšiť podľa toho, koľko ich je na obrázku – vyplnia voľné miesto (najviac 2×).
    // Pri málo kartách sa stávky dajú pod seba (cez celú šírku) a ešte viac zväčšia.
    // Michal 13. 11.: stávky vždy vedľa seba v jednom riadku, len väčšie. Pri málo kartách vyššia kartička stávky
    // (trh + tip / kurz + stávkovka / vklad – 3 riadky), aby sa dalo písmo zväčšiť aj v polovičnej šírke.
    const TALL = 1.5;
    const tallH = (it) => { const r = 1 + it.combos.length; return CARD.head + r * CARD.pill * TALL + (r - 1) * CARD.gap + (it.more ? 30 : 0) + CARD.bottom; };
    const usedT = rows.reduce((t, it, i) => t + tallH(it) + (i ? lay.gap : 0), 0);
    const kT = rows.length ? (lay.avail - 8) / usedT : 0;
    const stack = kT >= 1.35;
    const k = stack ? Math.min(2.3, kT) : rows.length ? Math.max(1, Math.min(1.6, (lay.avail - 8) / rows.used)) : 1;
    const PH = CARD.pill * k * (stack ? TALL : 1), PG = CARD.gap * k;
    const ktime = (e) => new Date(e.date).toLocaleTimeString("en-GB", { timeZone: "Europe/Bratislava", hour: "2-digit", minute: "2-digit" });
    const pad = 22 * Math.min(k, 1.4), cx = X + pad, cw = IW - 2 * pad;
    const pillW = (cw - 12) / 2;
    const f = (v) => Math.round(v * k);
    const fs = (v) => Math.round(v * Math.min(k, 1.3)); // drobné popisy rastú menej
    const pill = (sd, other, px, py, extra) => {
      const ix = 16 * Math.min(k, 1.4);
      // Michal 13. 11.: v pravom dolnom rohu každej stávky zhodnotenie, ak vyjde práve táto stávka.
      extra = `+${n2((sd.odd * stakeOf(sd.odd, other) / 100 - 1) * 100)}%`;
      if (stack) {
        const iw = pillW - 2 * ix, mk = market(e0.market), lb = label(sd.label);
        let ew = 0;
        if (extra) { ctx.fillStyle = C.good; ctx.font = font(700, Math.round(16 * Math.min(k, 1.6)), B_FONT); ctx.textAlign = "right"; ctx.fillText(extra, px + pillW - ix, py + f(74)); ew = ctx.measureText(extra).width + 14; ctx.textAlign = "left"; }
        // Michal 13. 11.: „Total cards - Over 4.5“ – trh aj tip rovnako veľké a hrubé
        const ml = `${mk} - ${lb}`;
        ctx.fillStyle = C.text; fit(ctx, ml, 800, f(20), iw, B_FONT, 12); ctx.fillText(ml, px + ix, py + f(24));
        ctx.fillStyle = C.good; ctx.font = font(800, f(27), H_FONT); ctx.fillText(n2(sd.odd), px + ix, py + f(51));
        const ow = ctx.measureText(n2(sd.odd)).width;
        ctx.fillStyle = C.stone; fit(ctx, sd.book, 700, f(21), iw - ow - 12, B_FONT, 14); ctx.fillText(sd.book, px + ix + ow + 12, py + f(51));
        ctx.fillStyle = C.muted; fit(ctx, `Stake €${n2(stakeOf(sd.odd, other))}`, 600, Math.round(18 * Math.min(k, 1.8)), iw - ew, B_FONT, 12); ctx.fillText(`Stake €${n2(stakeOf(sd.odd, other))}`, px + ix, py + f(74));
        return;
      }
      const mk = market(e0.market);
      const st = `Stake €${n2(stakeOf(sd.odd, other))}`;
      // riadok 1: trh + tip vľavo, vklad vpravo; riadok 2: kurz + stávkovka vľavo, zhodnotenie vpravo dole
      ctx.fillStyle = C.muted; ctx.font = font(600, fs(17), B_FONT); ctx.textAlign = "right"; ctx.fillText(st, px + pillW - ix, py + f(22)); const sw = ctx.measureText(st).width + 12; ctx.textAlign = "left";
      const ml = `${mk} - ${label(sd.label)}`;
      ctx.fillStyle = C.text; fit(ctx, ml, 800, f(19), pillW - 2 * ix - sw, B_FONT, 11); ctx.fillText(ml, px + ix, py + f(22));
      ctx.fillStyle = C.good; ctx.font = font(800, f(18), B_FONT); ctx.textAlign = "right"; ctx.fillText(extra, px + pillW - ix, py + f(47)); const ew = ctx.measureText(extra).width + 12; ctx.textAlign = "left";
      ctx.fillStyle = C.good; ctx.font = font(800, f(25), H_FONT); ctx.fillText(n2(sd.odd), px + ix, py + f(48));
      const ow = ctx.measureText(n2(sd.odd)).width;
      ctx.fillStyle = C.stone; fit(ctx, sd.book, 700, f(19), pillW - 2 * ix - ow - 10 - ew, B_FONT, 12); ctx.fillText(sd.book, px + ix + 10 + ow, py + f(47));
    };
    let e0 = null;
    for (const it of rows) {
      const e = it.e; e0 = e;
      const h = (stack ? tallH(it) : it.h) * k;
      rr(ctx, X, y, IW, h, 20 * Math.min(k, 1.5)); ctx.fillStyle = C.card; ctx.fill();
      const pw = 0; // Michal 13. 11.: % zisku pri názve zápasu preč (je pri každej stávke v rohu)
      const tm = `${pre ? ktime(e) + " · " : ""}${e.home} – ${e.away}`;
      ctx.fillStyle = C.text; fit(ctx, tm, 800, f(26), cw - pw - 24, H_FONT, 16); ctx.fillText(tm, cx, y + f(34));
      let py = y + CARD.head * k;
      const pair = (s0, o0, s1, o1, extra, first) => {
        if (!first) py += PH + PG;
        // Michal 13. 11.: obe stávky dvojice v jednom spoločnom rámčeku, uprostred deliaca čiara.
        rr(ctx, cx, py, cw, PH, 12 * Math.min(k, 1.5)); ctx.fillStyle = C.card2; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + pillW + 6, py + PH * 0.18); ctx.lineTo(cx + pillW + 6, py + PH * 0.82); ctx.stroke();
        pill(s0, o0, cx, py, ""); pill(s1, o1, cx + pillW + 12, py, extra);
      };
      pair({ ...e.sides[0] }, e.sides[1].odd, e.sides[1], e.sides[0].odd, "", true);
      for (const c of it.combos) pair({ label: e.sides[0].label, odd: c.a.odd, book: c.a.book }, c.b.odd, { label: e.sides[1].label, odd: c.b.odd, book: c.b.book }, c.a.odd, `+${n2(c.margin * 100)}%`, false);
      if (it.more) { ctx.fillStyle = C.muted; ctx.font = font(600, f(18), B_FONT); ctx.fillText(`+ ${it.more} more combinations (see caption)`, cx, py + PH + f(24)); }
      y += h + lay.gap * k;
    }

    if (!list.length) { ctx.fillStyle = C.muted; ctx.font = font(600, 30, B_FONT); ctx.fillText("No surebets today.", X, y + 30); }
    footer(ctx, W, story ? H - 190 : H - 60, handle);
    return cv;
  }

  // ---------- Text k príspevku (ako správa s tipom na Telegrame, po anglicky) ----------
  const tag = (t) => "#" + String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  function caption(s, result) {
    const settled = !!result;
    const win = settled ? winner(s, result) : null;
    const sum = 1 / s.sides[0].odd + 1 / s.sides[1].odd;
    const profit = 100 * s.margin;
    const score = settled && result.goals.home !== null ? ` · FT ${result.goals.home}:${result.goals.away}` : "";
    const lines = [];
    lines.push(settled ? "✅ SUREBET SETTLED" : "🔒 NEW SUREBET");
    lines.push("");
    // 13. 11. 2026 (Michal): zápis ako na obrázku – „Zápas / trh“, „Over 4.5 (Betano 1.83) – Under 4.5 (Pinnacle 2.47)“.
    lines.push(`⚽ ${s.home} – ${s.away}${score} / ${market(s.market)}`);
    lines.push(`🏆 ${league(s)}${settled ? "" : " · 🕒 " + kickoff(s.date)}`);
    lines.push("");
    const [a, b] = s.sides;
    lines.push(...twoLines(s, a, b));
    if (settled && win !== null) lines.push(win === -1 ? "↩️ Void – both stakes refunded, no loss." : `✅ ${label(s.sides[win].label)} won (${s.sides[win].book})`);
    if (!settled || win !== -1) lines.push(`💰 Profit: €${n2(profit)} (${n2(profit)}%)${settled ? "" : ", whatever the score"}`);
    const combos = window.sbCombos ? window.sbCombos(s) : [];
    if (combos.length) {
      lines.push("", settled ? "🔁 Also worked at:" : "🔁 Also works at:");
      combos.forEach((p, k) => { if (k) lines.push(""); lines.push(`Profit ${n2(p.margin * 100)}%:`, ...twoLines(s, p.a, p.b)); });
    }
    lines.push("");
    lines.push("👑 ARBREX – Profit. Whatever the score.");
    lines.push("18+ · Bet responsibly.");
    lines.push("");
    lines.push(`#arbrex #football ${tag(s.league)}`);
    return lines.join("\n");
  }
  /** 13. 11. 2026 (Michal): jednoduchý zápis bez „@“ a „+“ – stávkovka: tip – kurz – vklad. */
  const stakeOf = (odd, other) => (100 * (1 / odd)) / (1 / odd + 1 / other);
  const betLine = (icon, sd, other, res = "") => `${icon} ${sd.book}: ${label(sd.label)} – odds ${n2(sd.odd)} – stake €${n2(stakeOf(sd.odd, other))}${res}`;
  /** 13. 11. 2026 (Michal): každá ďalšia dvojica rozpísaná rovnako ako hlavná – čo kde podať a koľko vsadiť. */
  const altPair = (s, c, k) => [
    `🔁 Option ${k + 2}:`,
    betLine("1️⃣", { book: c.a.book, label: s.sides[0].label, odd: c.a.odd }, c.b.odd),
    betLine("2️⃣", { book: c.b.book, label: s.sides[1].label, odd: c.b.odd }, c.a.odd),
    `💰 Profit from €100: €${n2(c.margin * 100)} (${n2(c.margin * 100)}%)`,
  ];
  /** 13. 11. 2026 (Michal): text ako obrázok – „Zápas / trh“ a „Over 4.5 (Betano 1.83) – Under 4.5 (Pinnacle 2.47)“. */
  const pairText = (s, a, b) => `${label(s.sides[0].label)} (${a.book} ${n2(a.odd)}) – ${label(s.sides[1].label)} (${b.book} ${n2(b.odd)})`;
  const stakesText = (a, b) => `€${n2(stakeOf(a.odd, b.odd))} – €${n2(stakeOf(b.odd, a.odd))}`;
  /** Michal 13. 11.: každá stávka na vlastnom riadku – „Over 4.5 (Betano 1.83) – Stake €57.44“. */
  const twoLines = (s, a, b, pre = "") => [
    `${pre}${label(s.sides[0].label)} (${a.book} ${n2(a.odd)}) – Stake €${n2(stakeOf(a.odd, b.odd))}`,
    `${pre}${label(s.sides[1].label)} (${b.book} ${n2(b.odd)}) – Stake €${n2(stakeOf(b.odd, a.odd))}`,
  ];
  /** 13. 11. 2026 (Michal): „Total corners 4.5“ + „Over (Bet365 2.10) – Under (Unibet 2.08)“ – hranica pri trhu, stávky v jednom riadku. */
  function splitLine(s) {
    const l0 = label(s.sides[0].label), l1 = label(s.sides[1].label);
    const m0 = /^(\S+)\s+([\d.]+)$/.exec(l0), m1 = /^(\S+)\s+([\d.]+)$/.exec(l1);
    if (m0 && m1 && m0[2] === m1[2]) return { line: " " + m0[2], s0: m0[1], s1: m1[1] };
    return { line: "", s0: l0, s1: l1 };
  }
  /** 13. 11. 2026 (Michal): „👉 Over 4.5 (Betano 1.83) - 57€“ – vklad zo 100 € zaokrúhlený na celé eurá (spolu 100). */
  const pointLines = (s, a, b) => {
    // Michal 13. 11.: sumy podľa môjho odporúčania – presne na centy, aby zisk sedel s Day total.
    const x = Math.round(stakeOf(a.odd, b.odd) * 100) / 100;
    return [`👉 ${label(s.sides[0].label)} (${a.book} ${n2(a.odd)}) - ${n2(x)}€`, `👉 ${label(s.sides[1].label)} (${b.book} ${n2(b.odd)}) - ${n2(100 - x)}€`];
  };
  const oneLine = (s, a, b) => { const p = splitLine(s); return `${p.s0} (${a.book} ${n2(a.odd)}) – ${p.s1} (${b.book} ${n2(b.odd)})`; };
  /** 13. 11. 2026 (Michal): hrubé písmo v texte – Unicode „bold“ znaky (fungujú na Instagrame aj Telegrame aj bez formátovania). */
  function bold(t) {
    return [...String(t).normalize("NFD")].map((ch) => {
      const c = ch.codePointAt(0);
      if (c >= 65 && c <= 90) return String.fromCodePoint(0x1d5d4 + c - 65);
      if (c >= 97 && c <= 122) return String.fromCodePoint(0x1d5ee + c - 97);
      if (c >= 48 && c <= 57) return String.fromCodePoint(0x1d7ec + c - 48);
      return ch;
    }).join("").normalize("NFC");
  }
  function dayCaption(day, list, pre = false) {
    list = [...list].sort((a, b) => b.maxMargin - a.maxMargin);
    const n = list.length;
    const avg = n ? list.reduce((t, e) => t + e.maxMargin, 0) / n : 0;
    // 13. 11. 2026 (Michal): súhrnný riadok až pod tipmi (spolu so ziskom), hore len dátum.
    // Michal 13. 11.: prázdny riadok pod dátumom, nad Profit a pod Profit.
    const lines = [`📅 ${pre ? "Today's surebets" : "Surebets"} · ${dayEn(day)}`, ""];
    for (const e of list) {
      if (lines.length > 2) lines.push("");
      // 13. 11. 2026 (Michal): bez hrubého písma a bez času – „Zápas / trh“, stávky, prázdny riadok, zisk.
      const [a, b] = e.sides;
      // Michal 13. 11. 14:42: „👉 Over 4.5 - 1.83 Betano / Under 4.5 - 2.47 Pinnacle“, pod každým tipom 💰 Profit, na konci 📊 celkovo.
      const tipLine = (x, y) => `👉 ${label(e.sides[0].label)} - ${n2(x.odd)} ${x.book} / ${label(e.sides[1].label)} - ${n2(y.odd)} ${y.book}`;
      const profit = (m) => `💰 Profit: €${n2(m * 100)} from €100 (${n2(m * 100)}%)`;
      lines.push(`${pre ? "🔒" : "✅"} ${e.home} - ${e.away} / ${market(e.market)}`, tipLine(a, b), profit(e.maxMargin));
      for (const c of dayCombos(e)) lines.push(tipLine(c.a, c.b), profit(c.margin));
    }
    // Michal 13. 11.: pri 1 surebete súčet netreba; pri viacerých krátky súčet dňa.
    // Michal 13. 11.: Day total vždy (aj pri 1 zápase), ikonka 💰.
    if (n) lines.push("", `📊 Day total: €${n2(avg * 100 * n)} from €${n * 100} (${n2(avg * 100)}%)`);
    lines.push("");
    lines.push("👑 ARBREX · 18+ · Bet responsibly", "#arbrex #football");
    return lines.join("\n");
  }

  // ---------- Okno ----------
  const st = { kind: "sb", s: null, day: null, list: null, fmt: "post", mode: "pre", result: null, cv: null };
  const HANDLE_KEY = "arbrex_ig_handle";
  try { const h = localStorage.getItem(HANDLE_KEY); if (h) document.getElementById("igHandle").value = h; } catch (e) { /* bez úložiska */ }
  const $ = (id) => document.getElementById(id);
  let fontsReady = null;
  function loadFonts() {
    if (!fontsReady) fontsReady = Promise.all([
      `800 80px "${H_FONT}"`, `600 30px "${B_FONT}"`, `700 30px "${B_FONT}"`, `800 30px "${B_FONT}"`, `500 30px "${B_FONT}"`,
    ].map((f) => document.fonts.load(f).catch(() => {}))).then(() => document.fonts.ready);
    return fontsReady;
  }
  async function render() {
    await loadFonts();
    const handle = $("igHandle").value.trim();
    if (st.kind === "day") {
      const pages = dayPages(st.list, st.fmt);
      if (st.page >= pages) st.page = pages - 1;
      $("igPageWrap").style.display = pages > 1 ? "" : "none";
      $("igPages").innerHTML = Array.from({ length: pages }, (_, i) => `<button type="button" class="chip${i === st.page ? " on" : ""}" data-p="${i}">${i + 1}</button>`).join("");
      $("igPageInfo").textContent = pages > 1 ? `${st.list.length} surebetov na ${pages} obrázkoch. „Zdieľať“ pošle všetky naraz (na Instagram ako karusel), „Stiahnuť“ stiahne všetky.` : "";
    } else $("igPageWrap").style.display = "none";
    st.cv = st.kind === "day" ? drawDay(st.day, st.list, st.fmt, handle, st.page, st.pre) : drawSurebet(st.s, st.fmt, st.mode === "settled" ? st.result : null, handle);
    $("igImg").src = st.cv.toDataURL("image/png");
    $("igText").value = st.kind === "day" ? dayCaption(st.day, st.list, st.pre) : caption(st.s, st.mode === "settled" ? st.result : null);
  }
  function fileName() {
    const slug = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
    return st.kind === "day" ? `surebets-${st.day}-${st.fmt}-${st.page + 1}.png` : `surebet-${slug(st.s.home)}-${slug(st.s.away)}-${st.mode === "settled" ? "settled" : "pre"}-${st.fmt}.png`;
  }
  function blob() { return new Promise((res) => st.cv.toBlob(res, "image/png")); }
  function open() { $("igModal").classList.add("on"); document.body.style.overflow = "hidden"; }
  function close() { $("igModal").classList.remove("on"); document.body.style.overflow = ""; }
  function setChips(id, attr, val) { for (const c of $(id).children) c.classList.toggle("on", c.dataset[attr] === val); }

  window.openIg = async function (s) {
    Object.assign(st, { kind: "sb", s, mode: "pre", result: null });
    $("igModeWrap").style.display = "";
    setChips("igMode", "m", "pre");
    const settledChip = $("igMode").querySelector('[data-m="settled"]');
    settledChip.disabled = true;
    const started = new Date(s.date).getTime() + 105 * 60000 < Date.now();
    $("igResInfo").textContent = started ? "Načítavam výsledok zápasu…" : "Vyhodnotený obrázok bude po skončení zápasu.";
    open();
    render();
    if (!started) return;
    try {
      const r = await fetch("/api/surebets/result?fixture=" + s.fixtureId).then((x) => x.json());
      if (r && r.finished) {
        st.result = r; settledChip.disabled = false; st.mode = "settled"; setChips("igMode", "m", "settled");
        const w = winner(s, r);
        $("igResInfo").textContent = `Výsledok ${r.goals.home}:${r.goals.away}. ` + (w === null ? "Ktorá stávka vyšla, sa nedá zistiť (chýba štatistika) – na obrázku bude len skóre a zisk." : "Vyhratá stávka je zvýraznená.");
        render();
      } else $("igResInfo").textContent = r && r.error ? r.error : "Zápas ešte neskončil.";
    } catch (e) { $("igResInfo").textContent = "Výsledok sa nepodarilo načítať."; }
  };
  /** Všetky strany súhrnu dňa ako súbory (na stiahnutie / zdieľanie naraz). */
  async function dayFiles() {
    const handle = $("igHandle").value.trim();
    const out = [];
    for (let i = 0; i < dayPages(st.list, st.fmt); i++) {
      const b = await cvBlob(drawDay(st.day, st.list, st.fmt, handle, i, st.pre));
      out.push(new File([b], `surebets-${st.day}-${st.fmt}-${i + 1}.png`, { type: "image/png" }));
    }
    return out;
  }
  window.openIgDay = function (day, list, pre = false) {
    list = [...list].sort((a, b) => b.maxMargin - a.maxMargin);
    Object.assign(st, { kind: "day", day, list, pre, page: 0 });
    $("igModeWrap").style.display = "none";
    open(); render();
  };
  // ---------- Všetky odohrané surebety naraz (zip) ----------
  const slugT = (t) => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const cvBlob = (cv) => new Promise((res) => cv.toBlob(res, "image/png"));
  /** day = "YYYY-MM-DD" → len surebety toho dňa; bez dňa všetky odohrané od 1. 11. */
  async function bulk(day, btn, info) {
    if (!window.JSZip) { info.textContent = "Nepodarilo sa načítať knižnicu na zip, obnovte stránku."; return; }
    btn.disabled = true;
    try {
      info.textContent = "Načítavam evidenciu surebetov…";
      // Rovnaký výber ako v prehľade (Známe zahraničné / Všetky / Moje), každý surebet raz.
      const byKey = new Map();
      for (const e of window.logListFor(window.currentLogScope())) {
        const prev = byKey.get(e.key);
        if (!prev || e.maxMargin > prev.maxMargin || (!prev.alts && e.alts && e.maxMargin === prev.maxMargin)) byKey.set(e.key, e);
      }
      const from = new Date("2026-11-01T00:00:00+01:00").getTime();
      const played = [...byKey.values()].filter((e) => { const t = new Date(e.date).getTime(); return t >= from && t + 115 * 60000 < Date.now() && (!day || dayKey(e.date) === day); })
        .sort((a, b) => a.date.localeCompare(b.date) || b.maxMargin - a.maxMargin);
      if (!played.length) { info.textContent = day ? "V tento deň ešte nie je žiadny odohraný surebet (obrázky sú až po skončení zápasu)." : "V evidencii zatiaľ nie je žiadny odohraný surebet."; return; }
      await loadFonts();
      const results = new Map();
      const ids = [...new Set(played.map((e) => e.fixtureId))];
      let done = 0; const total = ids.length;
      const worker = async () => {
        while (ids.length) {
          const id = ids.shift();
          try { results.set(id, await fetch("/api/surebets/result?fixture=" + id).then((x) => x.json())); } catch (e) { /* bez výsledku */ }
          done++; info.textContent = `Načítavam výsledky zápasov… ${done} / ${total}`;
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      const zip = new JSZip();
      const handle = $("igHandle").value.trim();
      const days = {};
      let n = 0, nores = 0;
      for (const e of played) {
        const r = results.get(e.fixtureId);
        const s = { ...e, margin: e.maxMargin };
        const res = r && r.finished ? r : null;
        if (!res) nores++;
        const d = dayKey(e.date);
        (days[d] ??= []).push(e);
        const name = `${d}-${slugT(e.home)}-${slugT(e.away)}-${slugT(market(e.market))}-${slugT(label(e.sides[0].label))}`;
        zip.file(`posts/${name}.png`, await cvBlob(drawSurebet(s, "post", res, handle)));
        zip.file(`stories/${name}.png`, await cvBlob(drawSurebet(s, "story", res, handle)));
        zip.file(`texts/${name}.txt`, caption(s, res));
        n++;
        if (n % 5 === 0) info.textContent = `Kreslím obrázky… ${n} / ${played.length}`;
      }
      for (const [d, list] of Object.entries(days)) {
        const sorted = [...list].sort((a, b) => b.maxMargin - a.maxMargin);
        for (const f of ["post", "story"]) for (let i = 0; i < dayPages(sorted, f); i++) zip.file(`daily-summary/${d}-${f}-${i + 1}.png`, await cvBlob(drawDay(d, sorted, f, handle, i)));
        zip.file(`daily-summary/${d}-text.txt`, dayCaption(d, list));
      }
      info.textContent = "Balím zip…";
      const blobZip = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blobZip);
      const a = document.createElement("a"); a.href = url; a.download = day ? `surebets-${day}.zip` : `surebets-od-1-11-${dayKey(new Date().toISOString())}.zip`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      const nd = Object.keys(days).length;
      info.textContent = `Hotovo: ${played.length} ${plural(played.length)} (príspevok + príbeh) a ${nd} ${nd === 1 ? "súhrn" : nd <= 4 ? "súhrny" : "súhrnov"} dňa.` + (nores ? ` Pri ${nores} chýba výsledok zápasu – sú bez skóre.` : "");
    } catch (err) {
      info.textContent = "Chyba: " + (err && err.message ? err.message : err);
    } finally { btn.disabled = false; }
  }
  $("igBulkBtn").addEventListener("click", () => bulk(null, $("igBulkBtn"), $("igBulkInfo")));
  // Zip jedného dňa (tlačidlo v prehľade po dňoch)
  $("logDays").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-zip]"); if (!b) return;
    bulk(b.dataset.zip, b, b.parentElement.querySelector(".zip-info"));
  });

  $("igFmt").addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (!c) return; st.fmt = c.dataset.f; setChips("igFmt", "f", st.fmt); render(); });
  $("igMode").addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (!c || c.disabled) return; st.mode = c.dataset.m; setChips("igMode", "m", st.mode); render(); });
  $("igHandle").addEventListener("change", () => { try { localStorage.setItem(HANDLE_KEY, $("igHandle").value.trim()); } catch (e) { /* bez úložiska */ } render(); });
  $("igClose").addEventListener("click", close);
  $("igCopy").addEventListener("click", async () => {
    const t = $("igText").value;
    try { await navigator.clipboard.writeText(t); } catch (e) { $("igText").select(); document.execCommand("copy"); }
    $("igCopy").textContent = "Skopírované ✓"; setTimeout(() => { $("igCopy").textContent = "Kopírovať text"; }, 1800);
  });
  $("igModal").addEventListener("click", (e) => { if (e.target === $("igModal")) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  $("igPages").addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (!c) return; st.page = Number(c.dataset.p); render(); });
  const saveFile = (b, name) => { const url = URL.createObjectURL(b); const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); };
  $("igDown").addEventListener("click", async () => {
    if (st.kind === "day" && dayPages(st.list, st.fmt) > 1) { for (const f of await dayFiles()) { saveFile(f, f.name); await new Promise((r) => setTimeout(r, 400)); } return; }
    const b = await blob(); const url = URL.createObjectURL(b);
    const a = document.createElement("a"); a.href = url; a.download = fileName(); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });
  $("igShare").addEventListener("click", async () => {
    const files = st.kind === "day" ? await dayFiles() : [new File([await blob()], fileName(), { type: "image/png" })];
    if (navigator.canShare && navigator.canShare({ files })) {
      try { await navigator.share({ files }); } catch (e) { /* zrušené */ }
    } else $("igDown").click();
  });
})();
