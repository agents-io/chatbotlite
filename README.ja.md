<p align="center">
  <img src="packages/chatbotlite/logo.png" width="80" alt="ChatbotLite">
</p>

<h1 align="center">ChatbotLite</h1>

<p align="center">
  <strong>3行でAIチャットボットを導入。</strong><br>
  チャットボットをゼロから作り直すのはもうやめませんか。<br>
  <sub>個人開発者・中小企業サイト向け。3週間のインテグレーション不要、今日から動きます。</sub>
</p>

<p align="center">
  <img src="docs/widget-screenshot.png" width="720" alt="ChatbotLiteウィジェット — ユーザーが「水漏れ点検はいくらですか？」と質問し、ボットが$95と回答、インライン決済カードを表示">
</p>

<p align="center">
  <a href="https://chatbotlite-demos.vercel.app"><strong>▶ デモを試す — 6業種のデモ・導入コード・比較表</strong></a>
</p>

<p align="center">
  <a href="https://github.com/agents-io/chatbotlite/stargazers"><img src="https://img.shields.io/github/stars/agents-io/chatbotlite?style=social" alt="GitHub stars"></a>
  <a href="https://www.npmjs.com/package/chatbotlite"><img src="https://img.shields.io/npm/v/chatbotlite.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/chatbotlite"><img src="https://img.shields.io/npm/dw/chatbotlite.svg" alt="npm downloads"></a>
  <a href="https://bundlephobia.com/package/chatbotlite"><img src="https://img.shields.io/bundlephobia/minzip/chatbotlite.svg" alt="bundle size"></a>
  <a href="https://github.com/agents-io/chatbotlite/actions/workflows/test.yml"><img src="https://img.shields.io/github/actions/workflow/status/agents-io/chatbotlite/test.yml?branch=main" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/chatbotlite.svg" alt="license"></a>
</p>

<p align="center">
  <a href="https://chatbotlite-demos.vercel.app">デモ</a> ·
  <a href="https://chatbotlite-demos.vercel.app/llms-full.txt">APIリファレンス</a> ·
  <a href="ROADMAP.md">ロードマップ</a> ·
  <a href="SKILL_MARKER_SPEC.md">SKILLプロトコル</a> ·
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">中文</a>
</p>

---

## 3行で導入

```tsx
import { ChatWidget } from "chatbotlite/react";

<ChatWidget endpoint="/api/chat" title="水道屋さん" theme={{ primary: "#1e3a8a" }} />
```

Reactを使っていない場合はscriptタグだけでOK（Shopify、WordPress、Webflow、静的HTML、なんでも）：

```html
<script src="https://unpkg.com/chatbotlite/dist/embed.global.js"></script>
<script>
  chatbotlite.mount({ endpoint: "/api/chat", title: "水道屋さん" });
</script>
```

サーバー側（`/api/chat`）：

```ts
import { ChatBot } from "chatbotlite/client";
import { knowledgeFromFile } from "chatbotlite/node";

const bot = new ChatBot({
  knowledge: knowledgeFromFile("./knowledge.md"),
  providers: { keys: { openai: process.env.OPENAI_API_KEY } }
});

export async function POST(req: Request) {
  const { message, transcript } = await req.json();
  return new Response(await bot.replyStream(message, { history: transcript }), {
    headers: { "Content-Type": "text/event-stream" }
  });
}
```

## ダウンタイムゼロ。自動フェイルオーバー。

複数のプロバイダーキーを登録するだけ。ストリーミング中にエラーが起きたら、次のプロバイダーが自動的に引き継いでリプライを最初からやり直します。トークンレベルの途中再開は0.8ロードマップで対応予定。

<p align="center">
  <img src="docs/failover-demo.gif" width="640" alt="フェイルオーバーのデモ：OpenAIが503を返し、Groqが引き継ぐ">
</p>

対応プロバイダー10社：OpenAI、Groq、DeepSeek、Gemini、Mistral、Fireworks、Cerebras、SambaNova、OpenRouter、Moonshot。

---

## 何ができるか

| | |
|--|--|
| **3行で導入** | Reactコンポーネントまたは`<script>`タグ。ビルドステップ不要。 |
| **10社のLLMプロバイダー** | 自動フェイルオーバーチェーン。今日はOpenAI、明日はGroq、テスト用にOllama。 |
| **Markdownナレッジベース** | サービス内容・営業時間・料金を`.md`ファイルに書くだけ。ベクトルDB不要。ハルシネーション防止機能付き。 |
| **13種類のアダプター** | Stripe、PayPal、Calendly、Cal.com、Formspreeなど。URLを貼るだけ。 |
| **ツールカード** | ボットがチャット内で決済・予約・ファイルアップロード・選択肢ボタンを表示。 |
| **セッション保存** | `ChatStorage`インターフェースで差し替え可能。デフォルトはlocalStorage。 |
| **ストリーミング** | SSEトークンがLLMの生成に合わせてリアルタイム表示。ブランドカラーのカーソル付き。 |
| **安全対策** | フレーズブロック＋オプションのLLMジャッジで入出力の安全性を確保。 |
| **永久無料** | Apache 2.0。SaaSサブスク不要。会話課金なし。 |

---

## アダプター（v0.7）

URLだけのアダプター。URLを貼れば動く。バックエンド不要、APIキー不要。

```tsx
import { stripeLink, calendlyUrl } from "chatbotlite/adapters";

<ChatWidget
  endpoint="/api/chat"
  tools={{
    requestPayment: stripeLink("https://buy.stripe.com/your-link"),
    scheduleCallback: calendlyUrl("https://calendly.com/your-page/30min"),
  }}
/>
```

**決済**: `stripeLink`, `paypalLink`, `squareLink`, `lemonSqueezyLink`, `gumroadLink`
**予約**: `calendlyUrl`, `calcomUrl`, `savvycalUrl`, `acuityUrl`, `msBookingsUrl`, `googleCalendarApptUrl`
**リード獲得**: `formspreeUrl`, `tallyUrl`

---

## ツールカード

ボットが`[SKILL:...]`マーカーを出力すると、ウィジェットがインタラクティブなカードを表示します。

```
[SKILL:requestPayment amount=4250 currency="jpy" reason="点検費用"]
[SKILL:scheduleCallback durationMin=15 timezone="Asia/Tokyo"]
[SKILL:uploadForReview purpose="見積書" accept="image/*,application/pdf"]
[SKILL:pickerMessage prompt="ご希望のサービスは？" options="点検,修理,緊急対応"]
```

詳細は[SKILLマーカープロトコル仕様](SKILL_MARKER_SPEC.md)を参照。

---

## プロバイダー設定

```ts
providers: {
  keys: {
    openai:   process.env.OPENAI_API_KEY,
    groq:     process.env.GROQ_API_KEY,
    deepseek: process.env.DEEPSEEK_API_KEY,
  },
  chain: [
    { provider: "openai",   model: "gpt-4o-mini" },
    { provider: "groq",     model: "llama-3.3-70b-versatile" },
    { provider: "deepseek", model: "deepseek-chat" }
  ]
}
```

上から順に優先。429/5xxでリトライし、失敗したら次のプロバイダーへ。

---

## デモ

6業種すべて同じnpmパッケージで動作：[chatbotlite-demos.vercel.app](https://chatbotlite-demos.vercel.app)

| 業種 | デモ |
|---|---|
| EC | [Bayside Coffee Co.](https://chatbotlite-demos.vercel.app/shopify-store/) |
| サービス業 | [Acme Plumbing](https://chatbotlite-demos.vercel.app/plumber/) |
| 飲食 | [Bella Italia](https://chatbotlite-demos.vercel.app/restaurant/) |
| 医療 | [Smile Care Dental](https://chatbotlite-demos.vercel.app/dentist/) |
| 士業 | [MaxTax](https://chatbotlite-demos.vercel.app/tax-prep/) |
| ウェルネス | [Sunrise Yoga](https://chatbotlite-demos.vercel.app/yoga-studio/) |

---

## ドキュメント

- [APIリファレンス（完全版）](https://chatbotlite-demos.vercel.app/llms-full.txt)（35KB、LLM読み取り可）
- [llms.txt 概要](https://chatbotlite-demos.vercel.app/llms.txt)
- [SKILLマーカープロトコル](SKILL_MARKER_SPEC.md)
- [ロードマップ](ROADMAP.md)
- [デザインシステム](DESIGN_SYSTEM.md)

---

## コントリビュート

PRは歓迎です。マージ基準は[CONTRIBUTING.md](CONTRIBUTING.md)を参照してください。

セキュリティに関する報告は[SECURITY.md](SECURITY.md)をご確認ください。公開Issueではなく直接ご連絡をお願いします。

## ⭐ 週末を節約できたら

スターを押してもらえると、同じようにチャットウィジェットをゼロから作り直そうとしている次の開発者に届きます。OSSってそういうものですよね。

[★ GitHubでスターする](https://github.com/agents-io/chatbotlite)

## ライセンス

Apache 2.0。商用利用OK。

---

[agents-io](https://github.com/agents-io) が開発。同チームの他プロジェクト：[Cross-Code Organizer](https://github.com/mcpware/cross-code-organizer)（328★ Claude Code・Codex CLI・MCPサーバーの設定ダッシュボード）・[PokeClaw](https://github.com/agents-io/pokeclaw)（875★）。
