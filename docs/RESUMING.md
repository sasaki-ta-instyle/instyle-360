# instyle-360 再開手順

このドキュメントは、Claude Code セッションを終了したり別の Mac に切り替えた後で、
`instyle-360` の開発・運用作業をスムーズに再開するためのチェックリスト。

> **更新ルール:** このファイルを変更したら必ず main に push して、別 Mac / 別メンバーが
> 最新を取れる状態に保つ。秘密値そのものは絶対に書かない（取得元のリンクのみ）。

---

## 0. このアプリの基本情報

| 項目 | 値 |
|---|---|
| 公開 URL | `https://app.instyle.group/instyle-360/` |
| GitHub | `https://github.com/sasaki-ta-instyle/instyle-360`（Private 想定） |
| ConoHa デプロイ先 | `/var/www/app/instyle-360/` |
| 共有 env | `/var/www/_shared/apps/app-instyle-360.env`（chmod 600） |
| PM2 名 | `app-instyle-360` |
| ポート | `3009` |
| Healthcheck | `/instyle-360/api/health` |
| USE_DB | `true` |

---

## 1. 同じ Mac で再開する

Claude Code を終了しただけなら、以下だけで OK。

```bash
claude
```

このプロジェクトのチャット履歴・memory・state はそのまま残っている。
何も入れなくても前回の文脈のまま再開できる。

---

## 2. 別の Mac（サブ機 / 新メンバー）で再開する

### 2.1 Claude Code 環境を揃える

メイン Mac の `~/.claude` 配下（settings / memory / agents / skills / plugins）は
**`instyle-claude-sasaki` リポジトリ** が同期の正本。bootstrap してメイン機と同じ状態にする。

### 2.2 ソースコードを取得

```bash
mkdir -p ~/Workspace
gh repo clone sasaki-ta-instyle/instyle-360 ~/Workspace/instyle-360
cd ~/Workspace/instyle-360
```

### 2.3 ローカル開発に必要なツール

```bash
brew install pnpm
# Redis を使うアプリなら:
# brew install redis && brew services start redis
pnpm install
```

### 2.4 機密情報を配置（git 管理外）

#### `.env.local` — 1Password などから取得して配置

`~/Workspace/instyle-360/.env.local` に必要なキーを揃える（**git に入れない**）。
本番 `app-instyle-360.env` と概ね同じ値で動く。

このアプリで実際に使う env 一覧は **`.env.example` を見る**（ある場合）か、
`src/` 配下で `process.env.XXX` を grep する。

##### よくある取得元

| キー | 取得先 |
|---|---|
| `NEXTAUTH_SECRET` / `TOKEN_ENCRYPTION_KEY` | 1Password、または新規生成（`openssl rand -base64 48` / `openssl rand -hex 32`） |
| `RESEND_API_KEY` | https://resend.com/api-keys |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys |
| `*_DATABASE_URL` / DB 接続情報 | 1Password、または ConoHa 上の SQLite なら不要 |
| その他 SaaS のキー | 各サービスのコンソール |

#### `~/.ssh/config` + `conoha_{root,deploy}` 鍵（ConoHa 直接操作が必要な場合）

詳細は `~/Workspace/docs/conoha-setup.md` の **0-11b** を参照。

```bash
chmod 600 ~/.ssh/conoha_root ~/.ssh/conoha_deploy

mkdir -p ~/.ssh && cat >> ~/.ssh/config <<'EOF'

Host conoha-deploy
    HostName 160.251.201.115
    User deploy
    IdentityFile ~/.ssh/conoha_deploy
    IdentitiesOnly yes
    ServerAliveInterval 30

Host conoha-root
    HostName 160.251.201.115
    User root
    IdentityFile ~/.ssh/conoha_root
    IdentitiesOnly yes
    ServerAliveInterval 30
EOF
chmod 600 ~/.ssh/config

# 疎通確認
ssh conoha-deploy 'whoami'  # → deploy
ssh conoha-root   'whoami'  # → root
```

### 2.5 起動

```bash
# DB を使うアプリなら migration を先に
# pnpm migrate

pnpm dev
# → http://localhost:3009/instyle-360/ にアクセス
```

---

## 3. データ・状態の永続化マッピング

| 種類 | 場所 | 引き継ぎ方法 |
|---|---|---|
| ソースコード | GitHub `sasaki-ta-instyle/instyle-360` | `git clone` |
| Claude Code 設定（memory / agents / skills） | `instyle-claude-sasaki` リポジトリ | bootstrap で同期 |
| 本番 Web プロセス（PM2） | ConoHa `app-instyle-360` | 触らない、`deploy-prod.yml` で更新 |
| 本番 env（API キー類） | ConoHa `/var/www/_shared/apps/app-instyle-360.env` | サーバ側永続、`ssh conoha-deploy` で参照可 |
| 本番 DB（SQLite の場合） | ConoHa `/var/www/app/instyle-360/data/...` | サーバ側永続 |
| ConoHa SSH 鍵 | 1Password | 別 Mac で `~/.ssh/` に配置 |
| 各 SaaS のクレジット・課金 | 各サービスのアカウント | ブラウザで確認 |
| ローカル `.env.local` | 各 Mac のローカル | 1Password 経由 or 各 Mac で再生成 |
| ローカル `data/` 配下 | 各 Mac のローカル | **同期しない**（dev 用テストデータ） |

---

## 4. よくある運用コマンド

### 本番に新コードを反映する

```bash
gh workflow run deploy-prod.yml --ref main -R sasaki-ta-instyle/instyle-360
gh run watch -R sasaki-ta-instyle/instyle-360
```

### 本番 env を 1 行だけ書き換える

```bash
ssh conoha-deploy '
sed -i "s|^KEY_NAME=.*|KEY_NAME=new_value|" /var/www/_shared/apps/app-instyle-360.env
cd /var/www/app/instyle-360/current && pm2 startOrReload ecosystem.config.cjs --update-env
'
```

### 本番 PM2 ログを覗く

```bash
ssh conoha-deploy 'pm2 logs app-instyle-360 --nostream --lines 50 --raw'
```

### 本番 PM2 再起動

```bash
ssh conoha-deploy 'pm2 restart app-instyle-360 --update-env'
```

### ロールバック（手動）

```bash
ssh conoha-deploy '
cd /var/www/app/instyle-360/releases
ls -lt | head -5
ln -sfn <previous-sha> ../current.new && mv -T ../current.new ../current
pm2 reload app-instyle-360 --update-env
'
```

GitHub Actions 失敗時は workflow が自動ロールバックする。

---

## 5. 進捗 / 残タスク（2026-05-19 時点）

### 完了

- Phase 0（土台 / 認証バイパス / Neon 接続 / Vercel デプロイ）
- Phase 1（コアフロー骨格 + 管理 UI + メール通知の log/send 切替）
- 設問テンプレ 11 Philosophy v1（Google Sheet `1GZ9w8Rw_gxtEcS5XdxLa14O1f6W62gIm` 由来、35 問）を seed 投入
- 設問テンプレ編集 UI（カテゴリ・設問の追加・編集・並び替え・削除・複製）
- Codex 外部レビュー 8 件対応（test-mode ゲート、results アクセス制御、questionId 帰属検証、メール gate、N+1 解消、orderIndex transaction、コメント匿名化 distinct rater、enum 化）

### 未着手 / 残作業

| # | 内容 | 状態 |
|---|---|---|
| 1 | Vercel Deployment Protection 解除（社員に共有する前に必須） | ユーザー操作待ち |
| 2 | Phase 2: PDF / Excel 出力（個人 / サマリ） | 未着手 |
| 3 | Phase 2: サマリ集計（部門別 / ポジション別） | 未着手 |
| 4 | 本番認証（NextAuth Email Provider）への戻し | 未着手 |
| 5 | 設問編集 UI の DnD 並び替え・バージョニング運用 | Low |
| 6 | ConoHa 本番への切替（現在は Vercel + Neon で運用中） | 未定 |

### 重要な実装メモ

- **TEST_MODE**: Vercel Production env に `TEST_MODE=1` を必須化。外すと全画面 redirect。本番認証戻し時に `TEST_MODE=1` を撤去 + `lib/test-mode.ts` を `auth()` に差し替え
- **EMAIL_MODE**: 既定 `log`。実送信したいときだけ `EMAIL_MODE=send`。`MAIL_ALLOWED_DOMAINS=instyle.group` で送信先ドメイン制限あり
- **アクセス制御**: `/results/[subjectId]` は admin or 本人のみ。`/answer/[token]` は token を知っていれば誰でも入れる（招待者本人へのリンク前提）
- **匿名性**: `ANONYMITY_MIN_RESPONSES=3`、distinct rater 単位で n をカウント

---

## 6. 緊急時の参考

- ConoHa 本番運用 runbook: `~/Workspace/docs/conoha-setup.md`
- ポート台帳: `~/Workspace/docs/conoha-port-registry.md`
- アプリアーカイブ手順: `~/Workspace/docs/conoha-app-archive.md`
- このアプリの `CLAUDE.md`（同階層）: 設計判断・運用ルール
