/**
 * NextAuth Email Provider 用のマジックリンクメール送信。
 * 本番認証に戻したときに呼ばれる。テストモード中は呼ばれない（auth bypass のため）。
 *
 * 実送信 / ログのみは lib/mail/deliver.ts の deliver() が一手に判定する。
 */
import { deliver } from "@/lib/mail/deliver";

export async function sendMagicLinkEmail(params: {
  to: string;
  url: string;
  expires: Date;
}) {
  const { to, url, expires } = params;
  const expiresLabel = expires.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
  });

  const subject = "[instyle 360] ログイン用リンク";
  const text = [
    "instyle 360 へのログイン用リンクです。",
    "",
    "下記のリンクを開くとログインが完了します（30 分間有効）。",
    url,
    "",
    `有効期限: ${expiresLabel}`,
    "",
    "心当たりがない場合はこのメールを破棄してください。",
  ].join("\n");

  const html = `
    <div style="font-family:'Helvetica Neue',sans-serif;color:#35362D;line-height:1.7;max-width:520px;margin:0 auto;padding:24px;">
      <p style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#82837A;margin-bottom:12px;">
        INSTYLE GROUP / 360 review
      </p>
      <h1 style="font-size:24px;margin:0 0 16px;">ログイン用リンク</h1>
      <p style="font-size:14px;color:#35362D;">下のボタンを開くとログインが完了します。30 分間有効です。</p>
      <p style="margin:24px 0;">
        <a href="${url}" style="background:#35362D;color:#F3F1EE;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:14px;display:inline-block;">
          ログインする
        </a>
      </p>
      <p style="font-size:12px;color:#82837A;">有効期限: ${expiresLabel}</p>
      <p style="font-size:12px;color:#82837A;margin-top:16px;">
        ボタンが開けない場合は次のURLをコピーしてブラウザに貼り付けてください。<br/>
        <span style="word-break:break-all;color:#38537B;">${url}</span>
      </p>
      <hr style="border:none;border-top:1px solid #E1DCD0;margin:24px 0;"/>
      <p style="font-size:11px;color:#C4C1B0;">
        心当たりがない場合はこのメールを破棄してください。
      </p>
    </div>
  `;

  return await deliver({ to, subject, html, text });
}
