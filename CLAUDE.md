# instyle-360

## デプロイ設定（Claude Code 用）

このプロジェクトは ConoHa VPS にデプロイされる。本番反映は「本番にあげて」の指示で起動する（ワークスペース CLAUDE.md の「ConoHa 本番デプロイ」節を参照）。

| キー | 値 |
|---|---|
| CATEGORY | `app` |
| APP_NAME | `instyle-360` |
| PORT | `3009` |
| 公開URL | `https://app.instyle.group/instyle-360/` |
| HEALTHCHECK_PATH | `/instyle-360/api/health` |
| USE_DB | `true` |
| PM2名 | `app-instyle-360` |
| サーバ側パス | `/var/www/app/instyle-360/` |
| アプリ固有 env | `/var/www/_shared/apps/app-instyle-360.env` |

## 共通アセット (favicon / logo / OGP)

`https://app.instyle.group/_shared/static/{favicon.png, logo.svg, ogp.jpg}` で配信。`app/layout.tsx` の metadata に絶対 URL で指定する（詳細: `~/Workspace/docs/conoha-shared-assets.md`）。

```ts
const SITE_URL = "https://app.instyle.group/instyle-360";
const ASSETS   = "https://app.instyle.group/_shared/static";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  icons: { icon: `${ASSETS}/favicon.png`, apple: `${ASSETS}/favicon.png` },
  openGraph: {
    type: "website", siteName: "INSTYLE GROUP", locale: "ja_JP",
    url: SITE_URL, title: TITLE, description: DESCRIPTION,
    images: [{ url: `${ASSETS}/ogp.jpg`, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image", title: TITLE, description: DESCRIPTION,
    images: [`${ASSETS}/ogp.jpg`],
  },
};
```

## ローカル開発

```bash
pnpm install
cp .env.example .env.local      # 値を埋める
pnpm migrate                    # Postgres スキーマを当てる
pnpm dev
# http://localhost:3009/instyle-360/ でアクセス（basePath 込み）
```

> **初回コミット前に必ず `pnpm install` を実行**してください。生成された `pnpm-lock.yaml` をコミットに含めないと、GitHub Actions の `actions/setup-node@v4` (`cache: pnpm`) が `Dependencies lock file is not found` で失敗します。

## 本番デプロイ

「本番にあげて」と Claude Code に指示すると、`gh workflow run deploy-prod.yml --ref main` で GitHub Actions が走り、ConoHa VPS にデプロイされる。

手動で起動する場合:
```bash
gh workflow run deploy-prod.yml --ref main
gh run watch
```

## 初回 ConoHa セットアップ手順（このアプリ用）

初回は `~/Workspace/scripts/bootstrap-conoha-app.sh` を **通常ターミナル** から実行する。
（Claude Code の `!` bash は TTY が無いので対話入力を含むスクリプトは中断する — メモ `feedback_claude_code_bang_bash_no_tty`）

```bash
bash ~/Workspace/scripts/bootstrap-conoha-app.sh
```

スクリプトが下記を冪等に行う:
- ポート台帳 `~/Workspace/docs/conoha-port-registry.md` に行を追加
- GitHub Variables/Secrets を整備
- ConoHa 上のアプリディレクトリ・共有 env ファイル・Nginx 2 段 location を作成
- `nginx -t && systemctl reload nginx`

## ロールバック

GitHub Actions 側のヘルスチェック失敗時は自動で前 release に戻る。手動で戻す場合:

```bash
ssh deploy@160.251.201.115
cd /var/www/app/instyle-360/releases
ls -lt   # 直前の release ディレクトリを確認
ln -sfn <previous-sha> ../current.new && mv -T ../current.new ../current
pm2 reload app-instyle-360 --update-env
```

## デザインシステム

**Flat design system** を適用（`~/Workspace/design-system/design.md` 準拠）。
- トークン: `app/globals.css`（`--color-*` / `--r-*` / `--font-sans` `--font-display`）
- フォント: `Gen Interface JP` + `Gen Interface JP Display`（CDN ロードは `app/layout.tsx`）
- 角丸: クロソイド / superellipse(2.5)
- コントラスト原則: `border` で区切らず、`--color-surface` の段差で浮かせる（明らかな視認性不足のときだけ例外で 1px 線を許可）
- ハイライト `#E2DD2A` は本文内ポイントマーキング専用、CTA や面要素には使わない（メモ `feedback_highlight_usage`）

## 仕様メモ（実装方針）

- **目的**: グループ社員向けの 360 度評価システム。既存 SaaS「360（さんろくまる）」を参照に内製。
- **テナント**: instyle group 単一組織（multi-org スキーマは持たない）
- **認証**: NextAuth v5 (`next-auth@5`) + Drizzle Adapter + Email Provider × Resend
  - DB セッションストラテジ
  - 送信元は `MAIL_FROM`（既定 `noreply@instyle.group`）。Resend で `instyle.group` の DNS は認証済み（メモ `reference_resend_domain`）
- **DB**: PostgreSQL + Drizzle ORM
  - ローカル: Docker / brew services の Postgres
  - 本番: ConoHa 同居 Postgres（接続文字列は `.env.app` の `DATABASE_URL`）
- **匿名性ハード制約**:
  - 評価者の `user_id` は被評価者向け API レスポンスから除外し、`relation` のみ返す
  - 同一 `subject_id` × `relation` で n < `ANONYMITY_MIN_RESPONSES`（既定 3）のとき平均値を非表示にする
- **段階リリース**:
  - Phase 0: 土台（DB スキーマ初版 + マジックリンクログインのみ）← 現在
  - Phase 1: コアフロー MVP（プロジェクト作成 → 設問 → 評価者割当 → 回答 → Web 結果）
  - Phase 2: 集計と PDF/Excel 出力
  - Phase 3: AI 気づきサポート（Claude API + prompt cache、引用元コメント ID 必須）
  - Phase 4: サマリ集計 / 経年比較 / Web フィードバック公開設定 / コメント削除 / 管理者 2FA
- **オリジナル元マニュアル**: `~/Desktop/360(さんろくまる)　管理者マニュアル/`（読み込み用）
- **計画ファイル**: `~/.claude/plans/https-360do-notion-site-360-6d17bff55767-sleepy-ladybug.md`

## 環境変数

| キー | 用途 | 必須 |
|---|---|---|
| `DATABASE_URL` | Postgres 接続文字列 | ✓ |
| `AUTH_SECRET` | NextAuth セッション暗号化 | ✓ |
| `AUTH_URL` | NextAuth がコールバック URL を構築する基底（basePath 込み） | ✓ |
| `RESEND_API_KEY` | マジックリンクメール送信 | ✓ |
| `MAIL_FROM` | 送信元（既定 `noreply@instyle.group`） | △ |
| `ANTHROPIC_API_KEY` | Phase 3 の AI 要約 | △（Phase 3） |
| `ANONYMITY_MIN_RESPONSES` | 平均値マスキングのしきい値（既定 3） | △ |
