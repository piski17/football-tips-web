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
    // Znak: kruh radaru
    ctx.strokeStyle = C.stone; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(X + 18, y - 12, 18, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(X + 18, y - 12, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = C.stone; ctx.beginPath(); ctx.arc(X + 18, y - 12, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.text; ctx.font = font(800, 34, H_FONT); ctx.textBaseline = "alphabetic";
    spaced(ctx, "TIPRADAR", X + 50, y, 5);
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
    y += tsz * 0.82;
    ctx.font = font(600, 30, B_FONT); ctx.fillStyle = C.stone; ctx.fillText("vs", X, y);
    y += tsz * 1.0;
    ctx.font = font(800, tsz, H_FONT); ctx.fillStyle = C.text; ctx.fillText(away, X, y);
    y += story ? 70 : 58;
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
    const gap = 24, cw = (IW - gap) / 2, ch = story ? 380 : 296;
    s.sides.forEach((sd, k) => {
      const cx = X + k * (cw + gap);
      const won = win === k, lost = win !== null && win !== -1 && win !== k;
      rr(ctx, cx, y, cw, ch, 28);
      ctx.fillStyle = won ? C.goodBg : C.card; ctx.fill();
      ctx.strokeStyle = won ? C.good : C.line; ctx.lineWidth = won ? 4 : 2; ctx.stroke();
      ctx.globalAlpha = lost ? 0.45 : 1;
      let iy = y + (story ? 62 : 56);
      ctx.fillStyle = C.muted; ctx.font = font(700, 22, B_FONT); spaced(ctx, ("BET " + (k + 1)).toUpperCase(), cx + 30, iy, 3);
      if (won || lost || win === -1) {
        const t = won ? "WON ✓" : lost ? "LOST" : "VOID";
        ctx.font = font(800, 22, B_FONT); ctx.fillStyle = won ? C.good : C.muted; ctx.textAlign = "right"; ctx.fillText(t, cx + cw - 30, iy); ctx.textAlign = "left";
      }
      iy += story ? 58 : 52;
      const lb = label(sd.label);
      const lsz = fit(ctx, lb, 800, 44, cw - 60, H_FONT, 26);
      ctx.font = font(800, lsz, H_FONT); ctx.fillStyle = C.text; ctx.fillText(lb, cx + 30, iy);
      iy += story ? 108 : 90;
      ctx.font = font(800, story ? 104 : 96, H_FONT); ctx.fillStyle = won ? C.good : C.stone; ctx.fillText(n2(sd.odd), cx + 28, iy);
      iy += story ? 52 : 46;
      ctx.font = font(700, 28, B_FONT); ctx.fillStyle = C.text;
      const bk = "at " + sd.book; fit(ctx, bk, 700, 28, cw - 60, B_FONT, 18); ctx.fillText(bk, cx + 30, iy);
      iy += story ? 52 : 40;
      const stake = (100 * (1 / sd.odd)) / sum;
      ctx.font = font(600, 24, B_FONT); ctx.fillStyle = C.muted; ctx.fillText(`Stake €${n2(stake)} of €100`, cx + 30, iy);
      ctx.globalAlpha = 1;
    });
    y += ch + (story ? 70 : 50);

    // Ďalšie stávkovky s tým istým surebetom
    const alts = s.alts || [[], []];
    if (alts[0].length || alts[1].length) {
      ctx.font = font(700, 22, B_FONT); ctx.fillStyle = C.stone;
      spaced(ctx, "SAME SUREBET ALSO AT", X, y, 2.5);
      y += story ? 40 : 36;
      ctx.font = font(500, 24, B_FONT);
      const lines = story ? 2 : 1;
      s.sides.forEach((sd, k) => {
        if (!alts[k].length) return;
        const pre = label(sd.label) + ":  ";
        let txt = alts[k].map((o) => `${o.book} ${n2(o.odd)}`).join("  ·  ");
        ctx.fillStyle = C.text; ctx.font = font(700, 24, B_FONT); ctx.fillText(pre, X, y);
        const pw = ctx.measureText(pre).width;
        ctx.font = font(500, 24, B_FONT); ctx.fillStyle = C.muted;
        // Skrátiť, nech sa zmestí do riadku(ov)
        const items = alts[k].map((o) => `${o.book} ${n2(o.odd)}`);
        let shown = items.length;
        while (shown > 1 && ctx.measureText(items.slice(0, shown).join("  ·  ") + (shown < items.length ? `  +${items.length - shown}` : "")).width > (IW - pw) * lines * 0.98) shown--;
        txt = items.slice(0, shown).join("  ·  ") + (shown < items.length ? `  +${items.length - shown} more` : "");
        if (lines === 2 && ctx.measureText(txt).width > IW - pw) {
          // zalomenie na 2 riadky
          let cut = shown; while (cut > 1 && ctx.measureText(items.slice(0, cut).join("  ·  ")).width > IW - pw) cut--;
          ctx.fillText(items.slice(0, cut).join("  ·  "), X + pw, y); y += 34;
          ctx.fillText(items.slice(cut, shown).join("  ·  ") + (shown < items.length ? `  +${items.length - shown} more` : ""), X + pw, y);
        } else ctx.fillText(txt, X + pw, y);
        y += story ? 38 : 34;
      });
      y += story ? 24 : 6;
    }

    // Zisk
    const footY = story ? H - 190 : H - 60;
    const bh = story ? 260 : 176;
    const by = Math.max(y + 4, footY - 46 - 36 - bh);
    rr(ctx, X, by, IW, bh, 30);
    const gg = ctx.createLinearGradient(X, by, X + IW, by + bh);
    gg.addColorStop(0, "rgba(127,200,160,.20)"); gg.addColorStop(1, "rgba(127,200,160,.06)");
    ctx.fillStyle = gg; ctx.fill(); ctx.strokeStyle = "rgba(127,200,160,.55)"; ctx.lineWidth = 2; ctx.stroke();
    const profit = 100 * s.margin;
    ctx.fillStyle = C.good; ctx.font = font(800, 24, B_FONT);
    spaced(ctx, settled ? (win === -1 ? "BOTH STAKES RETURNED" : "PROFIT LOCKED IN") : "GUARANTEED PROFIT", X + 40, by + (story ? 66 : 52), 3);
    ctx.font = font(800, story ? 124 : 88, H_FONT);
    const big = settled && win !== -1 ? `+€${n2(profit)}` : win === -1 ? "€0.00" : `+${n2(profit)}%`;
    ctx.fillText(big, X + 36, by + (story ? 182 : 136));
    const bw = ctx.measureText(big).width;
    ctx.font = font(600, story ? 28 : 24, B_FONT); ctx.fillStyle = C.text;
    const sub1 = settled ? (win === -1 ? "Draw – no bet: both stakes refunded" : `+${n2(profit)}% on €100 staked`) : `€${n2(profit)} on every €100 staked`;
    const sub2 = settled ? (win === -1 ? "No loss, no risk" : "Whatever the score") : "Whatever the score";
    if (story) {
      ctx.fillText(sub1, X + 40, by + 228);
      ctx.fillStyle = C.muted; ctx.textAlign = "right"; ctx.fillText(sub2, X + IW - 40, by + 228); ctx.textAlign = "left";
    } else {
      const tx = X + 36 + bw + 34;
      ctx.fillText(sub1, tx, by + 102);
      ctx.fillStyle = C.muted; ctx.fillText(sub2, tx, by + 138);
    }
    footer(ctx, W, footY, handle);
    return cv;
  }

  /** Súhrn dňa (vyhodnotenie skúšky). */
  function drawDay(day, list, fmtKey, handle) {
    const W = 1080, H = fmtKey === "story" ? 1920 : 1350, story = fmtKey === "story";
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    const X = 72, IW = W - 2 * X;
    list = [...list].sort((a, b) => b.maxMargin - a.maxMargin);
    background(ctx, W, H);
    let y = story ? 220 : 112;
    header(ctx, W, y, "DAILY RESULTS", "good");
    y += story ? 130 : 100;
    ctx.fillStyle = C.text; ctx.font = font(800, story ? 96 : 84, H_FONT);
    ctx.fillText("Surebets", X, y); y += story ? 92 : 80;
    ctx.fillStyle = C.stone; ctx.fillText("of the day", X, y); y += story ? 72 : 62;
    ctx.fillStyle = C.muted; ctx.font = font(600, 28, B_FONT); ctx.fillText(dayEn(day), X, y);
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
    const maxRows = story ? 8 : 5, rh = story ? 112 : 96;
    const footerTop = story ? H - 270 : H - 130;
    const rows = list.slice(0, Math.min(maxRows, Math.floor((footerTop - y) / (rh + 12))));
    for (const e of rows) {
      rr(ctx, X, y, IW, rh, 20); ctx.fillStyle = C.card; ctx.fill();
      ctx.fillStyle = C.text; const tm = `${e.home} – ${e.away}`;
      fit(ctx, tm, 700, 30, IW - 260, B_FONT, 20); ctx.fillText(tm, X + 28, y + 44);
      ctx.fillStyle = C.muted; ctx.font = font(500, 22, B_FONT);
      const det = `${market(e.market)} · ${label(e.sides[0].label)} ${n2(e.sides[0].odd)} ${e.sides[0].book} / ${label(e.sides[1].label)} ${n2(e.sides[1].odd)} ${e.sides[1].book}`;
      fit(ctx, det, 500, 22, IW - 260, B_FONT, 16); ctx.fillText(det, X + 28, y + 78);
      ctx.fillStyle = C.good; ctx.font = font(800, 44, H_FONT); ctx.textAlign = "right";
      ctx.fillText(`+${n2(e.maxMargin * 100)}%`, X + IW - 28, y + rh / 2 + 16); ctx.textAlign = "left";
      y += rh + 12;
    }
    if (list.length > rows.length) { ctx.fillStyle = C.muted; ctx.font = font(600, 24, B_FONT); ctx.fillText(`+ ${list.length - rows.length} more surebets`, X, y + 26); }
    if (!list.length) { ctx.fillStyle = C.muted; ctx.font = font(600, 30, B_FONT); ctx.fillText("No surebets today.", X, y + 30); }
    footer(ctx, W, story ? H - 190 : H - 60, handle);
    return cv;
  }

  // ---------- Okno ----------
  const st = { kind: "sb", s: null, day: null, list: null, fmt: "post", mode: "pre", result: null, cv: null };
  const HANDLE_KEY = "tipradar_ig_handle";
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
    st.cv = st.kind === "day" ? drawDay(st.day, st.list, st.fmt, handle) : drawSurebet(st.s, st.fmt, st.mode === "settled" ? st.result : null, handle);
    $("igImg").src = st.cv.toDataURL("image/png");
  }
  function fileName() {
    const slug = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
    return st.kind === "day" ? `surebets-${st.day}-${st.fmt}.png` : `surebet-${slug(st.s.home)}-${slug(st.s.away)}-${st.mode === "settled" ? "settled" : "pre"}-${st.fmt}.png`;
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
  window.openIgDay = function (day, list) {
    Object.assign(st, { kind: "day", day, list });
    $("igModeWrap").style.display = "none";
    open(); render();
  };
  $("igFmt").addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (!c) return; st.fmt = c.dataset.f; setChips("igFmt", "f", st.fmt); render(); });
  $("igMode").addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (!c || c.disabled) return; st.mode = c.dataset.m; setChips("igMode", "m", st.mode); render(); });
  $("igHandle").addEventListener("change", () => { try { localStorage.setItem(HANDLE_KEY, $("igHandle").value.trim()); } catch (e) { /* bez úložiska */ } render(); });
  $("igClose").addEventListener("click", close);
  $("igModal").addEventListener("click", (e) => { if (e.target === $("igModal")) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  $("igDown").addEventListener("click", async () => {
    const b = await blob(); const url = URL.createObjectURL(b);
    const a = document.createElement("a"); a.href = url; a.download = fileName(); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });
  $("igShare").addEventListener("click", async () => {
    const b = await blob(); const file = new File([b], fileName(), { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); } catch (e) { /* zrušené */ }
    } else $("igDown").click();
  });
})();
