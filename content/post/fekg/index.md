---
title: "FEKG: Fast Enough Kusokora Generator"
date: 2021-07-05T09:44:01+09:00
categories:
  - project
tags:
  - typescript
  - firebase
  - graphql
thumbnailImage: screenshot.png
---

- [github.com/yubrot/fekg](https://github.com/yubrot/fekg)
- [Live Demo](https://fekg.vercel.app/)

クソコラを現代の Slack トークに十分な速度で作成するための Web アプリ。

<!--more-->

{{< gallery >}}
{{< largeimage src="screenshot.png" title="Demo" link="https://fekg.vercel.app/templates/b2PvDOASokID5kvrrCH6" >}}
{{< /gallery >}}

一月ほど費やして、クソコラを作成するための Web アプリを作った。主要な機能は、

- Google アカウントによるログイン機構
- **クソコラテンプレート** の作成 ... 画像のアップロード、画像の加工やラベルの配置
- クソコラテンプレートの管理や共有
- クソコラ画像の出力

といった、まあ画像編集機能を除けば Gyazo クローンのようなもの。Next.js を中心に Web フロントエンド関連のエコシステムを色々試したく始めたが、思ったよりフロントエンドばかりが大変なアプリケーションになった。今回試した色々について感想を書いておきたい。
[Live Demo](https://fekg.vercel.app)は Vercel と Firebase の無料枠で動いており、セットアップ手順を踏めば同じく無料枠で動かすことができる。

## Next.js

React による Web アプリケーションの開発を割と何も考えずに始められた。 `npx create-next-app` して生成されるファイルが Fully-featured な Web フレームワークのそれと比べると非常にシンプルで、覚えなければならない規約などが少ない。思想的/機能的には色々 (ISG とか SSR とか) あったりするものの、FEKG では難しいことは一切何もやっていなくて、それならそれで単にルーティングとかビルドとかバンドルとかをそつなくやってくれる存在だった。 [src/pages/](https://github.com/yubrot/fekg/tree/main/src/pages)以下はほとんどページに対応するコンポーネントをマウントしているのみで、それだけでページ遷移などが[src/pages/\_app.tsx](https://github.com/yubrot/fekg/blob/main/src/pages/_app.tsx)以下で動く。
また、Next.js は[公式リポジトリの examples/](https://github.com/vercel/next.js/tree/canary/examples) が非常に充実している。何か Next.js と一緒に使いたいものがあったらだいたいここに例があるぐらい色々入ってるので便利。

## TypeScript

TypeScript はもはやデファクトといえる存在で、特筆すべきことはないが、型関連の機能が継続的に改善されているのは素晴らしいなあと。[3.4](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html)の `const` assertions、[3.7](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html)の Optional Chaining、[4.0](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-0.html)の Variadic Tuple Types などは新たに活用した。特に Variadic Tuple Types は多くの開発者が待ち望んだ機能だろう。

### ESLint

現在は TypeScript でも ESLint を用いるようだ。
ここであえて取り上げておきたい存在に `eslint-plugin-react-hooks` がある。このプラグインの `react-hooks/exhaustive-deps` は、 `useCallback` や `useEffect` の `DependencyList` の不足を検知して Code action で自動でそれを補完できるというルールだ。これまでは `useEffect` の再実行タイミングの制御などを目的に手動で書いていたが、実際使ってみるとこれは機械的にやるべき **かつ機械的な DependencyList で問題ない実装であるべき** という考えに至った。DOM の描画に影響しない状態の保持には `useRef` があり、 適切な `useState` との使い分けがなされれば `useEffect` に渡る `DependencyList` の変化による意図しない副作用の再発生は起こらないはず。

## Tailwind CSS

今回は UI フレームワークを使わずに、[Tailwind CSS](https://tailwindcss.com/)を基盤に UI をフルスクラッチで実装した。実際触れてみて、なるほど表現力を制限して簡略化していることが力になっているのかなあとか思った。
フォーカスすべきところにフォーカスさせる力が働いているというか...ピクセル単位で margin や padding にこだわっている時間の多くは本筋ではなく、 `py-2 px-4` とか指定してこだわるべきでないところまでレイアウトが済むのがありがたい。
[Responsive Design](https://tailwindcss.com/docs/responsive-design)や各種疑似クラスがプレフィックスによって指定できたり (ex. `hover:text-blue-400`)、[カラー指定](https://tailwindcss.com/docs/customizing-colors)が色合いと明るさで抽象化されている&十分なプリセットが用意されていたりしている等、いずれも書き心地の向上に繋がっている。例えば [.primary-button](https://github.com/yubrot/fekg/blob/main/src/client/styles/globals.css#L35)を素の CSS で記述すると何個の属性とセレクタが必要になるだろうか。

## GraphQL

フロントエンドとバックエンドの通信には GraphQL を用いた。Schema-first なアプローチ、すなわち、まず GraphQL の[スキーマ](https://github.com/yubrot/fekg/blob/main/src/shared/graphql/schema.graphql)や[ドキュメント定義](https://github.com/yubrot/fekg/blob/main/src/shared/graphql/documents.graphql)を用意してから、フロントエンド、バックエンド共に [graphql-codegen](https://graphql-code-generator.com/) によって生成される TypeScript コードを利用する形にした。

GraphQL の強みの一つに、名前の通り (複雑な) グラフに対して柔軟にクエリできるとかあると思うが、今回のような単純な API でも、スキーマ定義一つから正確な validation とそれに即した型が得られるのはありがたい。「スキーマ定義一つから」で済むのは結局実装があるからで、 Node の GraphQL 関連のエコシステムと `graphql-codegen` がそつなくやってくれているというのが大きい。

- フロントエンド側は GraphQL のクライアントに [graphql-request](https://github.com/prisma-labs/graphql-request) を採用しているが、コード生成側のプラグインである `@graphql-codegen/typescript-graphql-request` がこれと統合されており、コード生成されたモジュールを import して `getSdk(untypedClient)` するだけで型付けされたクライアントが得られる。
- バックエンド側は、 `@graphql-codegen/typescript-resolvers` によって参照実装の `graphql` に与える Resolver が満たすべき型が与えられるので、それに適合するように実装を与える。

また `graphql-request`, `apollo-server` は共に [Upload 型](https://www.apollographql.com/docs/apollo-server/data/file-uploads/) をサポートしているので、画像のアップロードに用いる Blob を mutation 中に普通に含められる (この場合 `multipart/form-data` で送られる)。

{{< alert info >}}

ただ、Resolver 側の型には細かい穴がある。

- `@graphql-codegen/typescript-resolvers` は、non-nullable なフィールドについて、各 Resolver ではなく `ParentType` 側に non-nullable であることを要求する。Resolver 側のデフォルト実装が `ParentType` 型の値に対するプロパティアクセス/関数呼び出しによって実現されるため、これは自然な選択だろう。ただ Query や Mutation のようなルートの `ParentType` は `{}` とデフォルトされているためルートの Query や Mutation の実装を要求できていない。
- 同様に、 `ParentType` 側に non-nullable なフィールドが non-nullable であることを要求していることによって、Resolver 側の実装によって `ParentType` から推移的に取得できる計算などの遅延が少々行いにくく、また実装が散りやすい。 `ParentType` は override できるが、その場合その型のフィールドにデフォルト実装でない Resolver の実装が必須になるのだが、それを codegen で適切に設定する術は無さそうだ。最初に Query や Mutation から返すデータをオブジェクトにし、そのプロパティやメソッドで実装すべきなのだろう。

{{< /alert >}}

## Firebase Authentication

ユーザー認証に。試したところまずはとにかく楽だなと。
仕組みは[ドキュメント](https://firebase.google.com/docs/auth?hl=ja) にあるが、開発者の視点では認証フローが Client SDK の `signInWithPopup` とかの呼び出しに全て隠蔽されていて、 `signInWithPopup` が成功するとユーザー情報の入った `firebase.User` が得られるというところまで全て SDK 側で処理されている。
サーバー側でユーザー認証を行いたい場合にも、

1. `User.getIdToken` で短命な ID トークンを Firebase バックエンドに発行してもらい、
2. `Authorization: Bearer` ヘッダに含めるなどしてサーバーにリクエスト、
3. サーバー側で Admin SDK でそれを検証、

で済む。なお、ID トークンは単に単に期限が短い JWT なので Admin SDK のネイティブサポートが無い環境でも検証することができる。

- 参考: [ちょっとでもセキュリティに自信がないなら、 Firebase Authentication を検討しよう - mizdev](https://mizchi.dev/202008172159-firebase-authentication)

以下、Firebase Authentication を使う流れで、Firebase の無料範囲で使えるクラウドサービスを採用している。気が向いたら一通り AWS で実装したものを作って比較したい。

## Cloud Firestore

Firebase の無料枠で一番基本的なデータストア。NoSQL ドキュメント指向データベース。
Firestore というか NoSQL 全般に言えるが、真面目にパフォーマンスと整合性を考えていくと大変だよなあと。今回は一覧系の機能を削った上に検索機能も捨てたので単純な実装で完結しているが、この辺の機能を拡張しようとすると、非正規化した上でトリガーで更新の反映処理を行うかアプリケーションサイド JOIN するか....等が避けられない課題に上がってくる。
また Firestore 特有の感想としては、[Security rules](https://firebase.google.com/docs/rules)はどうにもやる気がしなかったので、[クライアントからのアクセスは一括で禁止にして](https://github.com/yubrot/fekg/blob/main/config/firestore.rules) 常にバックエンドから Admin SDK で叩くことにした。Firestore の利点の一つを潰してる使い方なのは間違いない。

## Cloud Storage

オブジェクトストレージ。Firebase の無料枠で。アップロードされた画像を置いている。Firestore との整合性を考えると Firestore のドキュメント操作に対するトリガーで消したりとかすべきだが[手抜きしている](https://github.com/yubrot/fekg/blob/main/src/server/graphql/resolvers.ts#L41)ので、API が途中で fail したりすると対応するテンプレートが無い画像が発生しうる。Functions 用の別実装をリポジトリ上に共存させる構成は試した方がいいな...ビルドとかどうするのか。

- 参考: [Next.js/examples/with-firebase-hosting](https://github.com/vercel/next.js/tree/canary/examples/with-firebase-hosting)

---

# 総括

全体としてあまり深く試せた感がない。今度は AWS でもっと真面目にアプリケーション開発してみるかなあ。

---

# 雑記

##### React Hooks の実装の配置を hooks と hooks/infrastructure に分けてみる

`hooks/` 直下には、 **型のレベルでは** 具体的な技術への依存が表出しない React Hooks の実装群を配置し、Firebase などへの具体的な技術も表出するような下回りの React Hooks の実装群は `hooks/infrastructure` 以下に置く。 `hooks/` 直下も実装レベルでは `hooks/infrastructure` に依存するが、こうすることで `hooks/` 直下の Hooks の利用者は具体的な実装技術を意識しないで済む...という目論見だが、あまりこういった型レベルで隠蔽するだけの分離はうまくいったことが無い。特に Firebase のような Fully-featured なプラットフォームでは実質的に `hooks/` のインターフェースが Firebase にロックインされたインターフェースになりがち、ということがある。とはいえ、強い依存に対する緩和措置としてこうしている。うーん微妙...

- 参考: [Firebase の存在をフロントエンドから隠蔽するために](https://blog.ojisan.io/fb-nukeru)

あとはまあ、 `next/link` や `next/router` への依存は諦める。

##### 未実装

アプリケーションとして欲しいものは他にも色々考えられるが、試したいことは試したので後は気が向いたら...

- レイヤー機能全般
  - クソコラは元の文字列と加工された文字列間の粗雑さによってクソコラ感が出るので、できるだけ元の文字列を活かすために領域選択で動かした部分はレイヤー化したい
- スタンプ機能全般
  - 特に海外の meme では雑に切り抜いた顔画像を貼るものが多い
- 画像からの文字列検出関係
  - 画像の一部文字列を置き換えるために、現在は (1) 範囲選択やペンで元の文字列を消す (2) 必要に応じて後続の文字列をずらす (3) 元の文字列と同じサイズ・色で置き換え用の文字列を載せる、というステップが必要となる。多くの文字列置き換えのクソコラは文中の一部分を置き換えるだけなので、画像から文字列を認識して置き換えたい、またクソコラを検索する上でも画像から文字起こししての全文検索や特徴検索が欲しい
- 画像管理機能全般
  - 特定のカテゴリのコマ画像を大量に投稿する、といったユースケースに向けてタグ付けやグループ分け機能が欲しい
- クリップボードにコピー
  - Blob については利用できるブラウザの API が無いっぽい、代替として SNS 投稿機能も考えられるが主要な利用先は Slack のようなチャットツールと考えているのでとりあえずは画像をコピーして使うという利用方法になる
