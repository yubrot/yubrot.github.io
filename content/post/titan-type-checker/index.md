---
title: "Titan Type Checker"
date: 2021-07-04T20:18:00+09:00
categories:
  - project
tags:
  - haskell
  - type-system
thumbnailImage: haskell-icon.png
---

- [github.com/yubrot/titan](https://github.com/yubrot/titan/)

[Typing Haskell in Haskell](https://web.cecs.pdx.edu/~mpj/thih/)という論文がある。この論文では、題通り Haskell で Haskell の型チェッカを実装しているのだが、詳細な解説がされており非常にわかりやすく、型システムの体系的な知識が無くとも Haskell の型チェッカの挙動を理解することができる。
しかしながらこの実装だけでは、プログラム(ソースコード)を直接入力にとって型チェックすることはできず、事前にいくつかの変換や解析が必要になる。この辺を含めて、単体でソースコードを入力にとり動作する型チェッカを実装し、いくつかの拡張を試みたものが[Titan Type Checker](https://github.com/yubrot/titan/)になる。

<!--more-->

# 構文解析

- [Parser.hs](https://github.com/yubrot/titan/blob/master/src/Titan/Parser.hs)

まず、ソースコードは単に文字列なので字句解析・構文解析を必要とする。Haskell の構文はインデントブロックを持つなど若干パースが面倒なのもあり、適当な構文を定義して[megaparsec](https://github.com/mrkkrp/megaparsec)でパーサを書いた。構文は意識してだいたい `LL(1)` に寄せたので手書きへの移行も難しくないだろう。

# 名前解決

- [Resolver.hs](https://github.com/yubrot/titan/blob/master/src/Titan/Resolver.hs)

プログラム中の定義(Def)と使用(Use)を解決する。現代的なプログラミング言語はモジュールシステム等色々あるのでより複雑な前処理を必要とするが、Titan では本筋ではないので「フラットな名前空間 1 つを持つ」とし、単に `Map` に定義を集め、全ての使用が解決可能かを検証するだけで済むようにした。それでも Titan ではもう一つ別の仕事がある。

### 全称量化子の明示

例えば恒等関数を Scala で書く場合、パラメタ化された型 (Parameterized types) を用いるだろう。

```scala
def identity[A](x: A): A = x
```

さて、Haskell 及び Titan では名前が小文字 `[a-z]` で始まる型を型変数に、大文字 `[A-Z]` で始まる型を型構成子として解釈する。Haskell で同様に恒等関数を定義する。

```haskell
identity :: a -> a
identity x = x
```

ここで型シグネチャ中に型変数 `a` を用いることを示す記述がどこにも無いことに注目したい。Haskell では型変数は暗黙に量化される。GHC の `ExplicitForAll` 拡張でこれを明示できる。

```haskell
identity :: forall a. a -> a
identity x = x
```

Titan では、名前解決の時点で、型シグネチャ中の量化子のない型変数に対応するように量化子を挿入する。なお、Titan では量化子の記述を構文レベルでサポートしており、明示的な量化子の記述は入れ子になった定義での型変数の使用を可能にする (GHC の `ScopedTypeVariables` 相当)。
この変換はあくまで字句的に、明示的な型シグネチャのある定義についてのみ行われる。型シグネチャのない定義は後の型推論によって多相にされる。

# カインド推論

- [KindInference.hs](https://github.com/yubrot/titan/blob/master/src/Titan/KindInference.hs)

Typing Haskell in Haskell では入力のカインドが全て解決済みとされているが、入力のプログラムではそれが全て明示されているわけではないのでカインドも推論が必要になる。例。

```haskell
-- a は値を持つ位置で使用されているので a :: *
data F a = F a

-- a は Int :: * を引数に取り、結果が * でなければならないので * -> *
data F a = F (a Int)

-- a :: _1 -> *, b :: _1 と推論され、未確定のカインド _1 が * にdefaultingされる
data F a b = F (a b)
```

カインド推論については[Haskell 2010 Language Report](https://www.haskell.org/onlinereport/haskell2010/)では[4.6 Kind Inference](https://www.haskell.org/onlinereport/haskell2010/haskellch4.html#x10-970004.6)でサラッと書かれており、以下のようなステップで行われる。

1. data, synonym, class 宣言を集め依存性解析を行う
2. それぞれの依存グループで型推論と同様の単一化アルゴリズムでカインドを決定していく
3. 確定しないカインドは単に `*` (`Type`) に defaulting する
   - Titan では GHC でいう `PolyKinds` は考慮しない

依存性解析は、具体的には強連結成分の分解を行う。循環した依存は同時に推論しなければならないので単にトポロジカルソートは適用できない。Titan は型シノニムを持たず、また[データ型宣言に型制約を含める機能も持たない](https://prime.haskell.org/wiki/NoDatatypeContexts)ので、データ型宣言が型クラスに依存することはなく、これによってデータ型宣言同士、次に型クラス宣言同士での依存性解析で済む。

カインド推論と依存性解析についての例を少し挙げてみる。

```haskell
-- (1)
data F a
data G = G (F Maybe)
```

この例は、 `F` の `a` は `a :: * -> *` と推論されるのではなく、 **エラーになる** 。 `G` は `F` に依存しているが、 `F` は `G` に依らず宣言されているため、 `F` の `a` は `a :: *` と defaulting される。後述の型推論では let 多相が働いて多相な型が付くので問題にならないところで、多相をサポートしないカインド推論では融通が利かないように思われるが、 `G` によって `F` の型変数 `a` のカインドが変わってしまうような推論を行うと **`F`が依存していない宣言の有無によって`F`の意味が変わってしまう** ことになる。

ほか、実装中に初めて気付いた点として、GHC では `ScopedTypeVariables` を有効にしていてもカインド推論はそれぞれの型シグネチャ単独で完結する。具体的には

```haskell
foo :: forall m a. m a -> ()
foo _ =
  let bar :: forall f. a f -> ()
      bar _ = ()
  in ()
```

のような定義は `m :: (* -> *) -> *` `a :: * -> *` とは推論されず、 `foo` の型スキーム時点で `m :: * -> *` `a :: *` と defaulting され、ローカルな `bar` のカインド推論中にエラーとなる。Titan もこの挙動を採用した。

# 型クラスに関する制限

Typing Haskell in Haskell の型クラス/インスタンスの検査は Haskell Report で課せられている一部制限のチェックを行っていない。この制限には GHC の `FlexibleContexts` `FlexibleInstances` で取り払われるような保守的な制限も含まれるが、それでも許容されない特に重要な制限としてインスタンス解決の停止性を保証するための制約がある。Titan の実装でもこの辺の検査は全て省略したので、例えば `instance Num a => Num a` みたいなインスタンス宣言が検査を通ってしまい、インスタンス解決が停止する保証が与えられない問題がある。なお、GHC でもこの制約は `UndecidableInstances` によって無効にできる (`MonadState` のインスタンス宣言など必要な場所では用いられている)。
Haskell の型クラスに相当する Rust の trait では、orphan rule を含めまた違った制約があり、この辺はそのうち調べて何かしらは実装するかもしれない。

一方で、Titan では以下のようなインスタンスの重複を eager に弾くようにした。

```haskell
class A a
instance A Int
instance A a
```

GHC でもこれは eager に弾かれてたような記憶があったがどうやら誤った記憶らしく、解決時に複数のインスタンスが選択された場合にはじめてエラーとなった。これも orphan instances が絡むためだろう...

# 型推論

- [TypeInference.hs](https://github.com/yubrot/titan/blob/master/src/Titan/TypeInference.hs)

構文解析、名前解決、カインド推論が終わって本題の型推論に入ることができる。型推論はまさに[Typing Haskell in Haskell](https://web.cecs.pdx.edu/~mpj/thih/)で解説されている通りだが、Titan では型変数に **レベル** を導入してレベルベースの量化 (`quantify`) を行うようにした。

- [Extension of ML type system with a sorted equationtheory on types](https://hal.inria.fr/inria-00077006/document)

`tiExpl` と `tiImpls` の実装が特に難しい。
Typing Haskell in Haskell の `tiImpls` の実装には若干問題がある。以下のような定義を考える:

```haskell
f = fst g  -- f :: a
g = (f, 0) -- g :: Num b => (a, b)
```

`f` `g` は相互参照しているので一つの `[Impl]` グループで型付けされるが、ここで `split` に defaulting しなくてもよい型変数として与えられるのは `f` `g` 双方の型シグネチャに表れる `g` のタプルの最初の要素の型 `a` のみで、タプルの 2 番目の要素の型 `Num b => b` は `f` においては型シグネチャに表れず、したがって defaulting できなければならない (1)。一方、 `f` `g` をそれぞれ量化する際はそれぞれの型シグネチャに表われる型変数で最大限量化できる (2)。Typing Haskell in Haskell では実際(1)の通り `quantify` に型変数が与えられているが、(2)の量化対象の型に `split` によって得られた **defaulting が必要である制約を除いた制約** を共通して用いているため、以下のように推論されてしまう:

```haskell
f = fst g  -- f :: a
g = (f, 0) -- g :: (a, b)
```

# 型システムの拡張

## 関数従属性

実践において、複数のパラメータを取る型クラスでは推論結果の曖昧性や強すぎる一貫性がしばしば問題になる。これを解決する手法として Haskell では `FunctionalDependencies` 拡張が広く使われている。モナド変換子で馴染み深い。これを実装することにした。

```haskell
class Monad m => MonadState s m | m -> s where
  get :: m s
  put :: s -> m ()
```

[Language and Program Design for Functional Dependencies](http://web.cecs.pdx.edu/~mpj/pubs/fundeps-design.pdf)では関数従属性の背景、形式化その他が紹介されている。実装にあたっては 2.5 が重要。

### インスタンス宣言の検査

従属性を満たすようにインスタンスの実装を検査する必要がある。

```haskell
class F a b | a -> b

-- a ~ [x] から b ~ y を一意に決定できない
instance F [x] y
-- こちらは F x y なので a ~ Maybe x より b ~ y を決定できる
instance F x y => F (Maybe x) y

-- 以下2つのインスタンスは a ~ Int に対する b が一貫していない
class F a b | a -> b
instance F Int Bool
instance F Int Int
```

この制約によって、従属性に基づいた型の unification を推論中に自由に行うことができる。

```haskell
class F a b | a -> b where
  f :: a -> b

instance F Bool Int where
  f _ = 5

g = f True -- F Bool a において、 a ~ Bool から一意に b ~ Int とできる
h x = (f x, f x) -- (F a b, F a c) において、同様に b ~ c とできる
```

関数従属性の実装によって、モナド変換子を含む[2.mtl.titan](https://github.com/yubrot/titan/blob/master/std/2.mtl.titan)を定義して解釈できるようになった。

Titan では関数従属性を実装したが、関数従属性と関連型はしばしばどちらを使うか等比較される。
GHC のリポジトリにも比較記事がある: [Type Families (TF) vs Functional Dependencies (FD)](https://gitlab.haskell.org/ghc/ghc/wikis/tf-vs-fd)

## Row Polymorphism

拡張可能なレコード型などに用いられている多相性。row polymorphism では、例えばレコード型は以下のように分解できる。

```haskell
   { x : Int, y : Bool }
=> {_} <x : Int, y : Bool>
=> {_} <x : Int | <y : Bool>>
=> {_} <x : Int | <y : Bool | <>>>
```

型コンストラクタ `{_}` のカインドは `# * -> *` で、この `# *` が row type のカインドにあたる。
空の row type が `<>` で、row type は `<label : ty | rowty>` の形で拡張できる。この `rowty` に型変数 (row variables) を置いて多相的にすることができる。

```haskell
   { x : Int, y : Bool | r }
=> {_} <x : Int, y : Bool | r>
=> {_} <x : Int | <y : Bool | r>>
```

row type は異なるラベルについて順番を入れ替えることができるので、この型は **フィールド x に Int, フィールド y に Bool を持つ任意のレコード** とできる。重複したラベルについては[元の論文](https://www.microsoft.com/en-us/research/publication/extensible-records-with-scoped-labels/)に。

実装では、型推論に手を加えたコアな部分はわずか 20 行程度で済んだ。推論の際にも足りないフィールド `l` があれば型変数を `<l : 'a | 'b>` のような拡張と unification していく。

# おまけ: Exhaustiveness/Useless checker

- [PatternChecker.hs](https://github.com/yubrot/titan/blob/master/src/Titan/PatternChecker.hs)

ついでにパターンマッチングの網羅性/役立たずチェッカも実装した。これは例えば以下のようなパターンを弾く。

```non_exhaustive.ml
(* (None, Some _) に対応するパターンがない: non exhaustive *)
let f = function
  | (Some _, _) -> 0
  | (None, None) -> 1
```

```useless.ml
(* Some (Some _) は先に Some _ にマッチするため決してマッチしない: useless *)
let a = function
  | Some _ -> 2
  | None -> 1
  | Some (Some _) -> 0
```

実装は [Warnings for pattern matching](http://moscova.inria.fr/~maranget/papers/warn/index.html) の解説をそのままコードに落としていった。
この論文では、ネストした構造を持つパターンを "平らな" 行列に変換していく。行が match 式の一つのパターンに対応し、役立たずか判定する関数 $ U $ はこれまでのパターンを表現する行列 $ P $ に対して新たに加えるパターンを表現する行 $ \vec{q} $ が役に立つかという形 $ U(P, \vec{q}) $ で表現される。計算中、 $ P $ は $ \vec{q} $ に応じてコンストラクタが展開されたり、関係のない行が取り除かれることでサイズが変化する。 $ U $ を少し拡張して網羅できていないパターンを抽出する関数 $ I $ も定義できる。

ここまではわりと率直なコードでおおよそのケースをカバーしているものの、Useless checker については Or-pattern が入るとまた少し話がややこしくなる。

```useless2.ml
(* 2つめのパターンは全体としてはUsefulだが One _ や Cons (_, _) の部分はUseless *)
let f = function
  | One x | Cons (x, _) -> x = 1
  | Nil | One _ | Cons (_, _) -> false
```

ではどうすれば良いかというと、単に Or-pattern を展開する:
$ U(P, ((t_1|t_2), q_2 \cdots q_n)) = U(P, (t_1, q_2 \cdots q_n)) \\; or \\; U(P @ (t_1, q_2 \cdots q_n), (t_2, q_2 \cdots q_n)) $

実装上は、Or-pattern とそれ以外を区別するために **区切り** $ \bullet $ を入れた行列 $ P \bullet Q \bullet R $ およびベクトル $ \vec{p} \bullet \vec{q} \bullet \vec{r} $ が導入されている。式は非常に複雑だけどもやっていること自体は素直で、

1. ネストしたパターンを展開しつつ、 $ Q $ に共通のパターンを、 $ R $ に Or-pattern を集める
2. 集め終わり、 $ R $ が空ならば単純に $ U(Q, \vec{q}) $ でよく、そうでない場合は
3. ある列 $ j \\; (1 \leq j \leq z) $, ($ z $ は $ R $ の列数) を選ぶ
4. その列 $ j $ を検査対象として、 $ R $ の他の列は共通のパターンとして考える
   $ 2^z $ 通りの全てのパターンを生成する必要はない
5. 全ての列についての useless な pattern を合成して全体の結果とする

# テスト

Titan では、あるプログラムの型推論の結果を「型が明記され、再度 Titan への入力として与えて型チェックが通るプログラム」として出力できることを要件として実装を始めた。これは例えば、型推論のテストコードは以下のように記述できる。

```haskell
-- codeに与えられたプログラムを型チェックし、プログラムとして再出力する
test :: String -> Either Error String
test code = fmap (pprint . program) (parse "test" code >>= bind emptyGlobal >>= resolve >>= ki >>= ti)

-- code, resultはいずれも型チェックによってresultと等価になる
(==>) :: HasCallStack => String -> String -> Expectation
code ==> result = forM_ [code, result] $ \code -> test code `shouldBe` Right result

-- ... テスト例
"val f = fun x -> x"
  ==> "val f : [(a : *)] a -> a = fun x -> x"
```

軽い気持ちでこのような要件を設定したものの、これによって GHC 拡張でいう `ExplicitForAll` `ScopedTypeVariables` あたりが必要で、オリジナルの Typing Haskell in Haskell よりかなり実装が複雑になってしまった。ネストした関数定義に型シグネチャが与えられているプログラムの推論はテストケースを増やすと色々とボロが出てきそうな気配がある。
ともあれ Haskell の Prelude から適当に定義を抽出した [0.prelude.titan](https://github.com/yubrot/titan/blob/master/std/0.prelude.titan) がこのテストを通過するようになった。

# パフォーマンス

正直パフォーマンスは全然出ない。特に fundeps 周りは規則を適用できる限り適用しましたみたいな実装になっているので厳しい。今後の課題としたい。
