---
title: "Rosetta Lisp"
date: 2021-07-04T20:01:00+09:00
categories:
  - project
tags:
  - lisp
thumbnailImage: rosetta-stone.jpg
---

- [github.com/yubrot/rosetta-lisp](https://github.com/yubrot/rosetta-lisp)

星の数ほど Lisp 系言語の実装は存在するが、自分もいくつかの言語で Lisp 処理系を作った。[SECD マシン](https://ja.wikipedia.org/wiki/SECD%E3%83%9E%E3%82%B7%E3%83%B3)風の非常に単純な VM をベースとすることで、複数の言語間で共通の命令セット、共通の[ブートストラップコード](https://github.com/yubrot/rosetta-lisp/blob/master/boot.lisp)で動作する。

<!--more-->

# SECD Machine

Lisp インタプリタの実装は、実行速度を度外視すれば基本的には難しくはない。S 式による四則演算機などを起点として、比較演算や条件分岐、逐次実行式や繰り返し式などを実装していけば次第にそれは Lisp インタプリタになってくる。環境を加えればレキシカルスコープも実現できる。
[48 時間で Scheme を書こう](https://ja.wikibooks.org/wiki/48%E6%99%82%E9%96%93%E3%81%A7Scheme%E3%82%92%E6%9B%B8%E3%81%93%E3%81%86)、[kanaka/mal](https://github.com/kanaka/mal)とかその類の解説も多い。特に[rui314/minilisp](https://github.com/rui314/minilisp)は一通りの Lisp の言語機能をガベージコレクションも含めて 1000 行程度の C 言語で(!)実現している。

一方全ての言語機能の実装が容易というわけでもない。インタプリタをごく単純に実装する場合、プログラムの実行は木構造のトラバースと同時に行うため、例外や継続といった実行順序に関与する機能の実装が難しくなる。例外はホストの言語にあるものを使えばいいが、継続はそうもいかないだろう。

ではどうするか。CPS 変換とかもあるが今回は適当な仮想機械でプログラムを実行するようにしたい。で、どこかで[SECD マシン](https://ja.wikipedia.org/wiki/SECD%E3%83%9E%E3%82%B7%E3%83%B3)を知り、これはまさにそういった目的にマッチしていたのでこれをベースに実装してみることにした。ただ今回の実装では元の SECD マシンをより高級な形で扱っている。

- E レジスタは単に、スコープチェイン機能を備えた key-value 型のデータ構造...環境の実装そのものへの参照を持つ。`ld` に代わる命令 `ldv` はキーを文字列で直接指定する。環境への変数束縛と代入は命令 `def`, `set` で動的に(ランタイムに)行う。
- 命令 `sel`, `app` はともに E, C レジスタを D レジスタに push する。命令 `join`, `ret` の代わりに共通の命令 `leave` で復帰する。
- 定数として S 式を丸ごと `ldc` で push できる (この Lisp 方言の S 式は全て immutable)
- あとは関数の代わりにマクロを push する命令 `ldm` とか (マクロが定義される環境は通常の式評価に用いるトップレベルの環境を共有している)

これらの仮想マシンコードへのコンパイル結果は、 Scala 実装の[scalisp on browser](https://yubrot.github.io/scalisp/)で実際に確認できる。

# ブートストラッピング

[boot.lisp](https://github.com/yubrot/rosetta-lisp/blob/master/boot.lisp)は 1 ファイルだけからなる 1000 行程度のブートストラップコードで、最低限のシンタックスとビルトイン関数を用意して実行すると基本的な関数・マクロを用意してくれるというもの。よくあるリスト演算や `and`, `or` 、意外っぽいところでは `let` や `quasiquote` も boot.lisp で実装されている。

実用的な Lisp 処理系では、 `and` とか `or` や `quasiquote` などは組み込みで実装されているだろう。組み込みで実装した方が単純に高速であったり、実装が容易であったり色々嬉しいはず。それでもできるだけ Lisp 自身で言語機能を定義するのには利点がある:

- 複数の言語で互換な処理系を作る上で、ホスト側で必要な実装をより小さくできる
- ある程度のコードを実行しての動作テストになる
- 最低限の定義から自己拡張して言語機能を揃えていくのが楽しい

2 点目について、 `boot.lisp` は `;!` から始まるコメントでそれぞれの定義のテストコードが記述されている。このテストは適当なプリプロセスを施した[test](https://github.com/yubrot/rosetta-lisp/blob/master/test)というパースが容易な形式にまとめられているので、[比較的簡単にテストを実行](https://github.com/yubrot/ocalisp/blob/master/driver/testrunner.ml)でき、テストを通った処理系は少なくともテストの範囲では Rosetta Lisp 互換の処理系と言えるようになる。

# Lisp による Lisp 実装: [wonderlisp](https://github.com/yubrot/wonderlisp)

boot.lisp によってある程度の言語機能が揃ったところで、適当なプログラムを書いてみようと[FizzBuzz](https://github.com/yubrot/rosetta-lisp/blob/master/examples/fizzbuzz.lisp)や[ライフゲーム](https://github.com/yubrot/rosetta-lisp/blob/master/examples/conways-gol.lisp)を書いたが、もう少し大きなプログラムを書いて動作を確認したい、ということで Rosetta Lisp 自身による Lisp 実装を行おうと考えた。

1. 手始めに、言語実装に(必要な|便利な)ビルトイン関数を加えた。 `boot.lisp` が要求するビルトイン関数のうち I/O 関連やベクタ構造などは Lisp 実装のために加えたものになる。
2. それらに基づいて[rosetta-lisp/contrib](https://github.com/yubrot/rosetta-lisp/tree/master/contrib)に簡易的なストリーム、ハッシュテーブル、パーサコンビネータの実装を加えた。
3. これで道具は揃ったので Lisp 本体を実装し、出来上がったのが[wonderlisp](https://github.com/yubrot/wonderlisp)になる。

wonderlisp 自身も `boot.lisp` を用いて初期化される Lisp 処理系なので、wonderlisp 自身を wonderlisp で動かせる。Rosetta Lisp シリーズは VM があれど S 式を順に逐次実行していく処理系なので、厳密にセルフホスティングできているかの検証は難しい。

どの Lisp 実装も CLI は `ocalisp inputs -- args` といった形を取り、 `inputs` が Lisp プログラムの書かれたファイル、 `args` が Lisp プログラムへの引数となる。[wonderlisp の CLI](https://github.com/yubrot/wonderlisp/blob/master/wonderlisp)は単に別の Rosetta Lisp 互換の実装に一連の Lisp プログラムを渡すだけなので、理論上は何重にもネストできる。しかし実行速度は元から度外視していたのでとにかく遅く、例えば ocalisp 上での wonderlisp 上で動く wonderlisp でのテストは実行して全部通るまでに数日かかる。

# 言語別感想

Rosetta Lisp 処理系の実装は新しい言語の課題として丁度よく、しばしば実装を加えていった。
新たにプログラミング言語を学ぶたび、プログラミング言語を実用するには、現実的に言語処理系以外のエコシステムが充実していること、またそれを理解することがが求められるということを実感する。しかしここでは言語ごとの処理系の実装の比較にフォーカスしたいため、処理系の実装にあたって言語仕様について思うことにフォーカスして感想をメモっている。

- [OCaml](https://scrapbox.io/yubrot/Rosetta_Lisp_in_OCaml)
- Scala ... 作ったが忘れた、Scala3 でやりたい気持ちはある
- [Go](https://scrapbox.io/yubrot/Rosetta_Lisp_in_Go)
- [F#](https://scrapbox.io/yubrot/Rosetta_Lisp_in_F%23)
- [Idris](https://scrapbox.io/yubrot/Rosetta_Lisp_in_Idris)
