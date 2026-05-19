/**
 * 評価サイクル中に送るメール通知。
 * 実送信 / ログのみの切替は lib/mail/deliver.ts の deliver() に一元化済み。
 */
import { deliver, getEmailMode } from "@/lib/mail/deliver";

export { getEmailMode };

function baseUrl(): string {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.AUTH_URL) return process.env.AUTH_URL;
  return "http://localhost:3009";
}

const wrap = (inner: string) => `
<div style="font-family:'Helvetica Neue',sans-serif;color:#35362D;line-height:1.7;max-width:520px;margin:0 auto;padding:24px;background:#F3F1EE;border-radius:12px;">
  <p style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#82837A;margin-bottom:12px;">
    INSTYLE GROUP / 360 review
  </p>
  ${inner}
  <hr style="border:none;border-top:1px solid #E1DCD0;margin:24px 0;"/>
  <p style="font-size:11px;color:#C4C1B0;">本メールに心当たりがない場合はこのまま破棄してください。</p>
</div>`;

const button = (href: string, label: string) => `
<p style="margin:24px 0;">
  <a href="${href}" style="background:#35362D;color:#F3F1EE;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:14px;display:inline-block;">
    ${label}
  </a>
</p>
<p style="font-size:12px;color:#82837A;word-break:break-all;">${href}</p>`;

/* ────────────────────────────────────────
 * 公開 API
 * ──────────────────────────────────────── */

export async function sendInvitation(args: {
  to: string;
  subjectName: string;
  projectName: string;
  raterToken: string;
  closesAt: Date | null;
  relation: string;
}) {
  const url = `${baseUrl()}/answer/${args.raterToken}`;
  const deadline = args.closesAt
    ? `回答期限: ${args.closesAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`
    : "回答期限は設定されていません。";
  const relLabel = relationLabel(args.relation);

  const subject = `[instyle 360] ${args.subjectName} さんの評価をお願いします`;
  const text = [
    `${args.projectName} で ${args.subjectName} さんの 360 評価をお願いします。`,
    `関係: ${relLabel}`,
    "",
    "下記のリンクから回答できます:",
    url,
    "",
    deadline,
  ].join("\n");
  const html = wrap(`
    <h1 style="font-size:22px;margin:0 0 16px;">評価のお願い</h1>
    <p>${args.projectName} で <strong>${args.subjectName}</strong> さんの 360 評価をお願いします。</p>
    <p style="font-size:13px;color:#82837A;">関係: ${relLabel}</p>
    ${button(url, "回答ページを開く")}
    <p style="font-size:12px;color:#82837A;">${deadline}</p>
  `);
  return await deliver({ to: args.to, subject, html, text });
}

export async function sendReminder(args: {
  to: string;
  subjectName: string;
  projectName: string;
  raterToken: string;
  closesAt: Date | null;
}) {
  const url = `${baseUrl()}/answer/${args.raterToken}`;
  const deadline = args.closesAt
    ? `回答期限: ${args.closesAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`
    : "回答期限は設定されていません。";
  const subject = `[instyle 360] ${args.subjectName} さんの評価が未提出です`;
  const text = [
    `${args.projectName} で ${args.subjectName} さんの 360 評価が未提出です。`,
    "",
    url,
    "",
    deadline,
  ].join("\n");
  const html = wrap(`
    <h1 style="font-size:22px;margin:0 0 16px;">回答リマインダー</h1>
    <p>${args.projectName} の <strong>${args.subjectName}</strong> さんの評価が未提出です。締切までにご回答ください。</p>
    ${button(url, "回答ページを開く")}
    <p style="font-size:12px;color:#82837A;">${deadline}</p>
  `);
  return await deliver({ to: args.to, subject, html, text });
}

export async function sendClosingNotice(args: {
  to: string;
  subjectName: string;
  projectName: string;
}) {
  const subject = `[instyle 360] ${args.projectName} の回答受付を締め切りました`;
  const text = [
    `${args.projectName} の回答受付を締め切りました。`,
    `${args.subjectName} さんの 360 評価が固定されます。結果ページは順次公開されます。`,
  ].join("\n");
  const html = wrap(`
    <h1 style="font-size:22px;margin:0 0 16px;">回答締切のお知らせ</h1>
    <p>${args.projectName} の回答受付を締め切りました。<br/>${args.subjectName} さんの 360 評価が確定されます。</p>
  `);
  return await deliver({ to: args.to, subject, html, text });
}

function relationLabel(r: string): string {
  switch (r) {
    case "self": return "自己評価";
    case "boss": return "上司から";
    case "peer": return "同僚から";
    case "subordinate": return "部下から";
    default: return r;
  }
}
