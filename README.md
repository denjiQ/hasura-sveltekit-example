```
docker compose up -d
pnpm i
```

in postgres container
```
pg_restore -U postgres -d postgres ./dvdrental
```

```
pnpm dev
```

http://localhost:8419/console

http://localhost:5173

## Hasura

- DBとの間に立てると、それだけでGraphqlサーバーを作ってくれる
- リソルバーも自動生成してくれる
- graphql schemaも自動提供するのでサクッとクライアントまで自動生成できる（zeus）
- https://note.com/dinii/n/n9be778bd7da3#8wybV
  - App Syncはいちいちスキーマ定義してmapping templateを書く
- Action: バリデーションなどDBに行く前の処理を実行できる
  - ただ記述が若干面倒。input validationの方が楽に記述できる
- Event: データ変更後の処理
- 単純なCRUDしかしない管理画面などの用途には良さそう

## SvelteKit

- Svelte版のNext
- 個人的に学習コストはそれなりにあったが、多分graphqlとの合わせ技だったから
- サーバーの処理とフロントの処理とファイルが分かれているのは見やすい
- 確かにめちゃ早い感じはする（初回ロードで58ms）
- template内でawaitできるのは綺麗に書けて良い
- 日本語のドキュメントが古い
    - 日本語ではloadの説明がjsベース
    - https://kit.svelte.jp/docs/load
    - https://svelte.dev/docs/kit/load
- $typeをimportしたりする魔法っぽいstatementは気に入らない人は気に入らないかも

## Hasura DDN

- Hasura v3
- 複数のデータソースをsubgraphとしてより体系的にまとめやすくなった
  - が、具体的な利点はよくわからない
- Hasura v2ではクエリ生成はコアのGraphqlエンジンがやっていたが、v3ではデータコネクターを自作できるので、より柔軟になった
  - データソースへのコネクターを開発者に作ってもらおうというスタンスな感じ
- v2に比べるとinput validationがなかったり、機能的に足りないところがある
  - でもそれも作ってねって感じなのか？
