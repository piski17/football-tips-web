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
      const lb = label(sd.label);
      const lsz = fit(ctx, lb, 800, 44, cw - 60, H_FONT, 26);
      ctx.font = font(800, lsz, H_FONT); ctx.fillStyle = C.text; ctx.fillText(lb, cx + 30, iy);
      iy += story ? 96 : 78;
      ctx.font = font(800, story ? 96 : 80, H_FONT); ctx.fillStyle = won ? C.good : C.stone; ctx.fillText(n2(sd.odd), cx + 28, iy);
      iy += story ? 50 : 42;
      ctx.font = font(700, 28, B_FONT); ctx.fillStyle = C.text;
      const bk = "at " + sd.book; fit(ctx, bk, 700, 28, cw - 60, B_FONT, 18); ctx.fillText(bk, cx + 30, iy);
      iy += story ? 46 : 36;
      const stake = (100 * (1 / sd.odd)) / sum;
      ctx.font = font(600, 24, B_FONT); ctx.fillStyle = C.muted; ctx.fillText(`Stake €${n2(stake)} of €100`, cx + 30, iy);
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
  const dayPer = (fmtKey) => (fmtKey === "story" ? 8 : 5);
  const dayPages = (list, fmtKey) => Math.max(1, Math.ceil(list.length / dayPer(fmtKey)));
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
    const per = dayPer(fmtKey);
    const rows = list.slice(page * per, page * per + per);
    const gap = story ? 18 : 14;
    const bottom = (story ? H - 190 : H - 60) - 46 - (page < pages - 1 ? 50 : 24);
    const avail = bottom - y;
    const minRh = story ? 112 : 96;
    const rh = rows.length ? Math.max(minRh, Math.min(story ? 900 : 600, (avail - gap * (rows.length - 1)) / rows.length)) : minRh;
    const ktime = (e) => new Date(e.date).toLocaleTimeString("en-GB", { timeZone: "Europe/Bratislava", hour: "2-digit", minute: "2-digit" });
    for (const e of rows) {
      rr(ctx, X, y, IW, rh, 24); ctx.fillStyle = C.card; ctx.fill();
      if (rh >= 330) {
        // Veľká karta: liga, zápas, obe stávky s kurzom, stávkovkou a vkladom zo 100 €, zisk.
        const pad = 32, cx = X + pad, cw = IW - 2 * pad;
        const combos = dayCombos(e);
        const hasAlt = combos.length > 0;
        const off = hasAlt ? 0 : Math.max(0, (rh - 600) / 2); // veľmi vysoká karta (príbeh s 1 surebetom) – obsah vycentrovať
        let yy = y + off + pad + 22;
        ctx.fillStyle = C.muted; ctx.font = font(700, 20, B_FONT);
        const top = `${pre ? ktime(e) + " · " : ""}${league(e)}${hasAlt ? " · " + market(e.market) : ""}`.toUpperCase();
        spaced(ctx, top.length > 60 ? top.slice(0, 58) + "…" : top, cx, yy, 2);
        yy += 58;
        ctx.fillStyle = C.text; const tm = `${e.home} – ${e.away}`;
        fit(ctx, tm, 800, rh >= 450 ? 50 : 42, cw, H_FONT, 26); ctx.fillText(tm, cx, yy);
        if (hasAlt) yy += 28;
        else { yy += 46; ctx.fillStyle = C.stone; ctx.font = font(700, 26, B_FONT); ctx.fillText(market(e.market), cx, yy); yy += 30; }
        const profH = hasAlt ? 80 : rh >= 450 ? 112 : 92;
        const freeAll = y + rh - off - pad - profH - 18 - yy;
        // 13. 11. 2026 (Michal): ďalšie stávkovky ako DVOJICE (stávkovka+kurz na jednu stranu, stávkovka+kurz na druhú, zisk) – ako na obrázku jedného surebetu.
        const rowLH = 36;
        const boxH = hasAlt ? Math.max(132, Math.min(210, freeAll - 18 - 76 - rowLH * Math.min(combos.length, 4))) : Math.min(220, freeAll);
        const sum = 1 / e.sides[0].odd + 1 / e.sides[1].odd;
        const bw = (cw - 18) / 2;
        e.sides.forEach((sd, i) => {
          const bx = cx + i * (bw + 18);
          rr(ctx, bx, yy, bw, boxH, 18); ctx.fillStyle = C.card2; ctx.fill();
          ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke();
          const big = boxH >= 170;
          ctx.fillStyle = C.muted; ctx.font = font(700, 18, B_FONT); spaced(ctx, i ? "BET 2" : "BET 1", bx + 22, yy + 36, 2);
          ctx.fillStyle = C.text; fit(ctx, label(sd.label), 700, big ? 30 : 26, bw - 44, B_FONT, 18); ctx.fillText(label(sd.label), bx + 22, yy + (big ? 76 : 68));
          ctx.fillStyle = C.good; ctx.font = font(800, big ? 52 : 40, H_FONT); ctx.fillText(n2(sd.odd), bx + 22, yy + (big ? 136 : 112));
          const odW = ctx.measureText(n2(sd.odd)).width;
          ctx.fillStyle = C.stone; fit(ctx, sd.book, 700, big ? 26 : 22, bw - 66 - odW, B_FONT, 16); ctx.fillText(sd.book, bx + 40 + odW, yy + (big ? 134 : 110));
          const stake = (100 * (1 / sd.odd)) / sum;
          if (boxH >= 170) { ctx.fillStyle = C.muted; ctx.font = font(600, 20, B_FONT); ctx.fillText(`Stake €${n2(stake)} of €100`, bx + 22, yy + boxH - 22); }
          else { ctx.fillStyle = C.muted; ctx.font = font(600, 18, B_FONT); ctx.textAlign = "right"; ctx.fillText(`Stake €${n2(stake)} / €100`, bx + bw - 22, yy + 36); ctx.textAlign = "left"; }
        });
        if (hasAlt) {
          const pyTop = y + rh - off - pad - profH;
          let ty = yy + boxH + 44;
          const fitRows = Math.max(1, Math.floor((pyTop - 14 - ty - 34) / rowLH));
          const more = combos.length > fitRows ? combos.length - (fitRows - 1) : 0;
          const shown = combos.slice(0, more ? fitRows - 1 : fitRows);
          ctx.fillStyle = C.stone; ctx.font = font(700, 20, B_FONT); spaced(ctx, "THE SAME SUREBET ALSO WORKS HERE", cx, ty, 2.5);
          ty += 34;
          const c2 = cx + cw * 0.43;
          ctx.fillStyle = C.faint; ctx.font = font(700, 17, B_FONT);
          spaced(ctx, label(e.sides[0].label).toUpperCase(), cx, ty, 2); spaced(ctx, label(e.sides[1].label).toUpperCase(), c2, ty, 2);
          ctx.textAlign = "right"; ctx.fillText("PROFIT", cx + cw, ty); ctx.textAlign = "left";
          for (const c of shown) {
            ty += rowLH;
            const cell = (b, o, x) => {
              ctx.fillStyle = C.text; fit(ctx, b, 700, 24, cw * 0.3, B_FONT, 14); ctx.fillText(b, x, ty);
              const w = ctx.measureText(b).width; ctx.fillStyle = C.stone; ctx.font = font(700, 24, B_FONT); ctx.fillText(n2(o), x + w + 10, ty);
            };
            cell(c.a.book, c.a.odd, cx); cell(c.b.book, c.b.odd, c2);
            ctx.fillStyle = C.good; ctx.font = font(800, 24, H_FONT); ctx.textAlign = "right"; ctx.fillText(`+${n2(c.margin * 100)}%`, cx + cw, ty); ctx.textAlign = "left";
          }
          if (more) { ty += rowLH; ctx.fillStyle = C.muted; ctx.font = font(600, 22, B_FONT); ctx.fillText(`+ ${more} more combinations`, cx, ty); }
        }
        const py = y + rh - off - pad - profH;
        rr(ctx, cx, py, cw, profH, 18); ctx.fillStyle = C.goodBg; ctx.fill();
        ctx.strokeStyle = "rgba(127,200,160,.55)"; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = C.muted; ctx.font = font(700, 20, B_FONT); spaced(ctx, "GUARANTEED PROFIT", cx + 26, py + profH / 2 + 8, 2);
        const pf = profH >= 112 ? 60 : profH >= 92 ? 50 : 44;
        ctx.fillStyle = C.good; ctx.font = font(800, pf, H_FONT); ctx.textAlign = "right";
        ctx.fillText(`+${n2(e.maxMargin * 100)}%`, cx + cw - 26, py + profH / 2 + pf * 0.35); ctx.textAlign = "left";
      } else if (rh >= 220) {
        // Stredná karta: liga, zápas, trh a každá stávka na vlastnom riadku, zisk vpravo.
        const sideW = IW - 300;
        const cbm = dayCombos(e);
        const alsoL = cbm.slice(0, 2).map((c, k) => `${k ? "or" : "Also:"} ${c.a.book} ${n2(c.a.odd)} + ${c.b.book} ${n2(c.b.odd)} → +${n2(c.margin * 100)}%${k === 1 && cbm.length > 2 ? `  (+${cbm.length - 2} more)` : ""}`);
        let yy = y + (rh - 196 - alsoL.length * 30) / 2;
        ctx.fillStyle = C.muted; ctx.font = font(700, 18, B_FONT);
        const top = `${pre ? ktime(e) + " · " : ""}${league(e)} · ${market(e.market)}`.toUpperCase();
        spaced(ctx, top.length > 52 ? top.slice(0, 50) + "…" : top, X + 32, yy + 16, 2);
        ctx.fillStyle = C.text; const tm = `${e.home} – ${e.away}`;
        fit(ctx, tm, 800, 40, sideW, H_FONT, 24); ctx.fillText(tm, X + 32, yy + 72);
        e.sides.forEach((sd, i) => {
          const ly = yy + 128 + i * 52;
          rr(ctx, X + 32, ly - 32, sideW, 44, 12); ctx.fillStyle = C.card2; ctx.fill();
          ctx.fillStyle = C.text; ctx.font = font(700, 24, B_FONT); ctx.fillText(label(sd.label), X + 48, ly - 2);
          ctx.fillStyle = C.good; ctx.font = font(800, 26, H_FONT); ctx.textAlign = "right";
          ctx.fillText(n2(sd.odd), X + 32 + sideW - 170, ly - 2);
          ctx.fillStyle = C.stone; ctx.font = font(700, 22, B_FONT); ctx.textAlign = "left";
          fit(ctx, sd.book, 700, 22, 150, B_FONT, 14); ctx.fillText(sd.book, X + 32 + sideW - 152, ly - 3);
        });
        alsoL.forEach((t, k) => { ctx.fillStyle = C.stone; fit(ctx, t, 600, 20, sideW, B_FONT, 14); ctx.fillText(t, X + 32, yy + 226 + k * 30); });
        ctx.fillStyle = C.muted; ctx.font = font(700, 18, B_FONT); ctx.textAlign = "right";
        ctx.fillText("PROFIT", X + IW - 32, y + rh / 2 - 34);
        ctx.fillStyle = C.good; ctx.font = font(800, 60, H_FONT);
        ctx.fillText(`+${n2(e.maxMargin * 100)}%`, X + IW - 32, y + rh / 2 + 30); ctx.textAlign = "left";
      } else {
        // Bežný riadok; pri väčšej výške navyše liga a väčšie písmo, obsah vycentrovaný.
        const tall = rh >= 150;
        const also = rh >= 108 ? alsoLine(e, 5) : "";
        const blockH = (tall ? 112 : 56) + (also ? 30 : 0);
        let yy = y + (rh - blockH) / 2;
        if (tall) {
          ctx.fillStyle = C.muted; ctx.font = font(700, 18, B_FONT);
          const top = `${pre ? ktime(e) + " · " : ""}${league(e)}`.toUpperCase();
          spaced(ctx, top.length > 50 ? top.slice(0, 48) + "…" : top, X + 28, yy + 16, 2);
          yy += 34;
        }
        ctx.fillStyle = C.text; const tm = `${e.home} – ${e.away}`;
        fit(ctx, tm, 700, tall ? 34 : 30, IW - 260, B_FONT, 20); ctx.fillText(tm, X + 28, yy + 28);
        ctx.fillStyle = C.muted; ctx.font = font(500, 22, B_FONT);
        const kt = pre && !tall ? ktime(e) + " · " : "";
        const det = `${kt}${market(e.market)} · ${label(e.sides[0].label)} ${n2(e.sides[0].odd)} ${e.sides[0].book} / ${label(e.sides[1].label)} ${n2(e.sides[1].odd)} ${e.sides[1].book}`;
        fit(ctx, det, 500, tall ? 24 : 22, IW - 260, B_FONT, 16); ctx.fillText(det, X + 28, yy + (tall ? 70 : 62));
        if (also) { ctx.fillStyle = C.stone; fit(ctx, also, 600, 19, IW - 260, B_FONT, 14); ctx.fillText(also, X + 28, yy + (tall ? 100 : 92)); }
        ctx.fillStyle = C.good; ctx.font = font(800, tall ? 52 : 44, H_FONT); ctx.textAlign = "right";
        ctx.fillText(`+${n2(e.maxMargin * 100)}%`, X + IW - 28, y + rh / 2 + (tall ? 18 : 16)); ctx.textAlign = "left";
      }
      y += rh + gap;
    }
    if (page < pages - 1) { ctx.fillStyle = C.muted; ctx.font = font(600, 24, B_FONT); ctx.fillText(`Swipe for more → (${list.length - (page + 1) * per} more)`, X, y + 26); }
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
    lines.push(`⚽ ${s.home} – ${s.away}${score}`);
    lines.push(`🏆 ${league(s)}`);
    if (!settled) lines.push(`🕒 ${kickoff(s.date)}`);
    lines.push(`📊 ${market(s.market)}`);
    lines.push("");
    s.sides.forEach((sd, k) => {
      const stake = (100 * (1 / sd.odd)) / sum;
      const icon = !settled || win === null ? (k === 0 ? "1️⃣" : "2️⃣") : win === -1 ? "↩️" : win === k ? "✅" : "❌";
      const res = !settled || win === null ? "" : win === -1 ? " · void" : win === k ? " · WON" : " · lost";
      lines.push(betLine(icon, sd, s.sides[1 - k].odd, res));
    });
    lines.push("");
    if (settled) lines.push(win === -1 ? "💰 Draw – both stakes refunded, no loss." : `💰 Profit from €100: €${n2(profit)} (${n2(profit)}%)`);
    else lines.push(`💰 Profit from €100: €${n2(profit)} (${n2(profit)}%), whatever the score`);
    const combos = window.sbCombos ? window.sbCombos(s) : [];
    if (combos.length) {
      lines.push("");
      lines.push(settled ? "The same surebet also worked at other bookmakers:" : "The same surebet also works at other bookmakers:");
      // 13. 11. 2026 (Michal): všetky dvojice – stávkovka a kurz na jednu stranu + stávkovka a kurz na druhú.
      combos.forEach((p, k) => { if (k) lines.push(""); lines.push(...altPair(s, p, k)); });
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
  function dayCaption(day, list, pre = false) {
    list = [...list].sort((a, b) => b.maxMargin - a.maxMargin);
    const n = list.length;
    const avg = n ? list.reduce((t, e) => t + e.maxMargin, 0) / n : 0;
    const lines = [`📅 ${pre ? "TODAY'S SUREBETS" : "SUREBETS OF THE DAY"} – ${dayEn(day)}`, "", `🔒 Surebets: ${n}`, `📈 Average profit: ${n2(avg * 100)}%`, `💰 €100 on each: €${n2(avg * 100 * n)} profit`, ""];
    for (const e of list) {
      const kt = pre ? new Date(e.date).toLocaleTimeString("en-GB", { timeZone: "Europe/Bratislava", hour: "2-digit", minute: "2-digit" }) + " · " : "";
      // 12. 11. 2026 (Michal): v texte aj celý tip – obe strany s kurzom a stávkovkou.
      const [a, b] = e.sides;
      lines.push(`${pre ? "🔒" : "✅"} ${kt}${e.home} – ${e.away} · ${market(e.market)}`,
        betLine("1️⃣", a, b.odd), betLine("2️⃣", b, a.odd), `💰 Profit from €100: €${n2(e.maxMargin * 100)} (${n2(e.maxMargin * 100)}%)`);
      const cb = dayCombos(e);
      if (cb.length) {
        lines.push("", "The same surebet also works at other bookmakers:");
        cb.forEach((c, k) => { if (k) lines.push(""); lines.push(...altPair(e, c, k)); });
      }
      lines.push("");
    }
    lines.push("👑 ARBREX – Profit. Whatever the score.", "18+ · Bet responsibly.", "", "#arbrex #football");
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
