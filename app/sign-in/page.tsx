import { signIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ verify?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const verifying = sp.verify === "1";
  const errored = !!sp.error;

  async function submit(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim();
    if (!email) return;
    await signIn("email", { email, redirectTo: "/" });
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
      }}
    >
      <div className="card" style={{ maxWidth: 460, width: "100%" }}>
        <p className="eyebrow" style={{ marginBottom: 12 }}>
          INSTYLE GROUP / 360 review
        </p>
        <h1 className="t-h2" style={{ marginBottom: 8 }}>
          ログイン
        </h1>
        <p
          className="t-small"
          style={{ color: "var(--color-text-muted)", marginBottom: 24 }}
        >
          会社のメールアドレスを入力すると、ログイン用のリンクが届きます。
        </p>

        {verifying ? (
          <div className="card-nested" style={{ marginBottom: 16 }}>
            <p className="t-body">
              メールを送信しました。受信箱を確認してリンクを開いてください。
            </p>
          </div>
        ) : null}
        {errored ? (
          <div
            className="card-nested"
            style={{
              marginBottom: 16,
              background: "var(--color-surface-3)",
              color: "var(--color-error)",
            }}
          >
            <p className="t-small">送信に失敗しました。少し時間をおいて再試行してください。</p>
          </div>
        ) : null}

        <form action={submit}>
          <label className="field" style={{ marginBottom: 16 }}>
            <span className="field-label">メールアドレス</span>
            <input
              className="input"
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="you@instyle.group"
            />
          </label>
          <button type="submit" className="btn btn-primary">
            ログインリンクを送る
          </button>
        </form>
      </div>
    </main>
  );
}
