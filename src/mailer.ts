import axios from "axios";

// E-maily pre administrátora cez službu Resend (resend.com).
// Na Renderi treba nastaviť RESEND_API_KEY a ADMIN_EMAIL (kam majú správy chodiť).
// Bez overenej domény posiela Resend z adresy onboarding@resend.dev, a to len na
// e-mail, s ktorým je účet v Resende založený – preto ADMIN_EMAIL = ten istý e-mail.
// Voliteľne MAIL_FROM, napr. "TipRadar <web@tipradar.eu>", keď bude doména overená.

export function isMailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.ADMIN_EMAIL);
}

function escapeHtml(v: string): string {
  return String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/** Pošle e-mail administrátorovi. Riadky sú [popis, hodnota]. Vráti true, ak sa podarilo. */
export async function sendAdminEmail(subject: string, rows: [string, string][], replyTo?: string): Promise<boolean> {
  if (!isMailEnabled()) {
    console.warn("E-mail sa neposlal: chýba RESEND_API_KEY alebo ADMIN_EMAIL.");
    return false;
  }
  const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n");
  const html =
    `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1e">` +
    `<h2 style="font-size:18px;margin:0 0 12px">${escapeHtml(subject)}</h2>` +
    rows.map(([k, v]) => `<p style="margin:0 0 8px"><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v).replace(/\n/g, "<br>")}</p>`).join("") +
    `</div>`;
  try {
    await axios.post(
      "https://api.resend.com/emails",
      {
        from: process.env.MAIL_FROM || "TipRadar <onboarding@resend.dev>",
        to: [process.env.ADMIN_EMAIL],
        subject,
        text,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      },
      { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, timeout: 15000 }
    );
    return true;
  } catch (err: any) {
    console.error("E-mail (Resend) zlyhal:", err?.response?.data ?? err?.message ?? err);
    return false;
  }
}
