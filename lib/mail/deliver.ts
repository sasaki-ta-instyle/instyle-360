/**
 * 全てのメール送信を仲介する単一の出口。
 *
 * - EMAIL_MODE が "send" のときだけ Resend 経由で実送信
 * - それ以外（既定）は console にログ出力するだけ
 * - 送信先ドメインが許可リストに無いときは "send" でも自動的にログにダウングレード
 *   （テスト用アドレスへの誤送信を防ぐ最後のフェンス）
 *
 * 環境変数:
 *   EMAIL_MODE              "send" | （未設定）  既定はログのみ
 *   MAIL_ALLOWED_DOMAINS    実送信を許可するドメインのカンマ区切り (例: "instyle.group")
 *                           未設定なら "instyle.group" を既定として扱う
 */
import { Resend } from "resend";

const FROM = process.env.MAIL_FROM ?? "instyle 360 <noreply@instyle.group>";
const MODE = (process.env.EMAIL_MODE ?? "log").toLowerCase();

function allowedDomains(): Set<string> {
  const raw = process.env.MAIL_ALLOWED_DOMAINS ?? "instyle.group";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  );
}

const DENIED_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "localhost",
  "invalid",
]);

function domainOf(to: string): string | null {
  const m = to.match(/@([^>\s]+)/);
  return m ? m[1].toLowerCase() : null;
}

let _client: Resend | null = null;
function client() {
  if (_client) return _client;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  _client = new Resend(key);
  return _client;
}

export type MailSpec = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type DeliveryResult = {
  delivered: boolean;
  via: "resend" | "log";
  reason?: string;
};

export async function deliver(m: MailSpec): Promise<DeliveryResult> {
  const dom = domainOf(m.to);

  if (dom && DENIED_DOMAINS.has(dom)) {
    console.log(
      `[mail:log:denied-domain] to=${m.to} subject=${m.subject} (domain "${dom}" is in deny list)`,
    );
    return { delivered: false, via: "log", reason: "denied-domain" };
  }

  if (MODE !== "send") {
    console.log(
      `[mail:log] to=${m.to} subject=${m.subject} (EMAIL_MODE != "send")`,
    );
    return { delivered: false, via: "log", reason: "mode-log" };
  }

  if (dom) {
    const allow = allowedDomains();
    if (!allow.has(dom)) {
      console.log(
        `[mail:log:not-allowed-domain] to=${m.to} subject=${m.subject} (domain "${dom}" not in MAIL_ALLOWED_DOMAINS)`,
      );
      return { delivered: false, via: "log", reason: "not-allowed-domain" };
    }
  }

  const res = await client().emails.send({
    from: FROM,
    to: m.to,
    subject: m.subject,
    text: m.text,
    html: m.html,
  });
  if (res.error) throw new Error(`Resend: ${res.error.message}`);
  return { delivered: true, via: "resend" };
}

export function getEmailMode(): "send" | "log" {
  return MODE === "send" ? "send" : "log";
}
