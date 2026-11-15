# GitHub Actions からのデプロイ

`main` の dev・prd へのデプロイは `.github/workflows/deploy.yml` を `workflow_dispatch` で起動して行う。
ローカルの `make deploy ENV=...` も従来どおり使える。

## 流れ

1. `prepare` ジョブ（GitHub environment `plan-<env>`、承認なし）
   - そのコミットで `ci.yml` が `main` への push として成功していなければ止まる。
   - バックエンドのイメージを作り、ECR に `:git-<sha>` で push する。`:latest` には触らない。
   - 使う AWS ロールは `notes-gha-plan-<env>`。ECR の `notes-app-api-<env>` への push しかできない。
     Terraform を実行しないので、承認前に state や SSM の秘密値に届く経路は無い。
2. `deploy` ジョブ（GitHub environment `deploy-<env>`、kter の承認が必要）
   - 承認後に `terraform plan` を実行し、conftest で検査し、値を含まない要約を Job Summary に書く。
   - データ資源（DSQL・S3 バケット・Cognito ユーザープール・SSM パラメータ・DynamoDB）の削除か置き換えが
     plan に含まれていたら apply せずに止まる。意図した変更なら `allow_data_loss=true` で起動し直す。
   - 保存した plan を `terraform apply` し、ECR の `:latest` をデプロイしたダイジェストに付け替える。
   - `target` が `all` か `frontend` なら、`make _deploy-frontend` でフロントをビルドして S3 に同期し、CloudFront を無効化する。
   - 使う AWS ロールは `notes-gha-deploy-<env>`（PowerUserAccess と `notes-app-*` に限った IAM）。

承認の時点では plan はまだ無い。plan と apply は承認後の同じジョブで続けて走るので、Job Summary を見てから止めることはできない。
IAM やデータ資源を触る変更は、承認する前にローカルで `make tf-plan ENV=<env>` を確認する。

承認待ちの実行は `deploy-<env>` の concurrency グループを占有する。古いコミットの実行を後から承認すると古いコードがデプロイされるので、
不要になった承認待ちは Reject する。

`target=frontend` はイメージのビルドも plan・apply もせず、state の出力を読んでフロントだけを更新する。
dev の結合テスト（`_deploy-test`）は CI では実行しない。バイパストークンを読む必要があるからだ。

## 秘密値の扱い

リポジトリは公開で、Actions のログも公開される。`terraform show -json` の出力には dev の結合テスト用バイパストークンが平文で入る。

- Terraform の出力はすべて `$RUNNER_TEMP` のファイルに書き、ログにも成果物にも Job Summary にも出さない。
- 失敗時は決まった文言と終了コードだけを出す。原因はローカルで同じ make ターゲットを実行して調べる。
  ローカルのプロファイルは管理者権限なので、ロールの権限不足はローカルでは再現しない。その場合は CloudTrail を
  ユーザー名（セッション名）`notes-deploy-<env>-<run_id>` / `notes-plan-<env>-<run_id>` で絞って AccessDenied を探す。
- Job Summary は `scripts/ci/summarize_plan.py` が作る。読むのはリソースのアドレスとアクション名だけ。
- conftest のメッセージは属性値を含みうるので、件数だけを出す。
- `TF_LOG` は使わない。アーティファクトは作らない。`setup-terraform` の wrapper は無効にしている。

## エージェントがデプロイを始めるとき

Claude Code（ローカル・web）は次のコマンドで起動してよい。

```bash
gh api -X POST repos/kter/notes/actions/workflows/deploy.yml/dispatches \
  -f ref=main -f 'inputs[env]=dev' -f 'inputs[target]=all'
```

- 起動したら実行の URL を報告する（`gh api 'repos/kter/notes/actions/workflows/deploy.yml/runs?per_page=1' --jq '.workflow_runs[0].html_url'`）。
- 承認はしない。`pending_deployments` やレビュー承認の API は呼ばない。承認は人が GitHub の画面で行う。
- `allow_data_loss=true` は人に指示されたときだけ付ける。
- Codex Cloud は `gh` で dispatch できないので、起動を人に依頼して戻す。

## 初回の準備（オーナーが一度だけ行う）

アカウントごと（dev: 031921999648、prd: 401731371959）に行う。

1. GitHub の OIDC プロバイダがあることを確認する。IAM コンソールの ID プロバイダに
   `token.actions.githubusercontent.com`（対象者 `sts.amazonaws.com`）があればよい。
   `terraform/ci-bootstrap` はこれを参照するだけで作らない（他のリポジトリと共有しているかもしれないため）。
   無ければ先に IAM コンソールで作る。
2. ロールを作る。管理者権限のプロファイル（`dev` / `prd`）で次を実行する。plan を読んでから apply する。

   ```bash
   make ci-bootstrap-plan ENV=dev
   make ci-bootstrap-apply ENV=dev   # 最後に plan_role_arn と deploy_role_arn を表示する
   make ci-bootstrap-plan ENV=prd
   make ci-bootstrap-apply ENV=prd
   ```

   state は app と同じバケットの `notes-app/ci-bootstrap.tfstate` に入る。
3. GitHub の Settings → Environments に 4 つの environment を作る。

   | environment | Required reviewers | Deployment branches | 変数 `AWS_ROLE_ARN` |
   | --- | --- | --- | --- |
   | `plan-dev` | なし | Selected branches: `main` のみ | dev の `plan_role_arn` |
   | `plan-prd` | なし | Selected branches: `main` のみ | prd の `plan_role_arn` |
   | `deploy-dev` | `kter` | Selected branches: `main` のみ | dev の `deploy_role_arn` |
   | `deploy-prd` | `kter` | Selected branches: `main` のみ | prd の `deploy_role_arn` |

   Deployment branches の制限は必須。ワークフロー内の `github.ref == 'refs/heads/main'` はブランチ側で書き換えられるので、
   `main` 以外からロールを引き受けられないことを保証するのは environment の設定になる。
   `deploy-*` では「Prevent self-review」は付けない（承認者が kter 一人のため）。
4. ローカルで `TF_VAR_bootstrap_admin_emails` / `TF_VAR_bootstrap_admin_user_ids` を設定して apply している場合は、
   同じ値を `deploy-<env>` の environment secret `BOOTSTRAP_ADMIN_EMAILS` / `BOOTSTRAP_ADMIN_USER_IDS` に入れる。
   入れないと CI の apply で Lambda の環境変数が空に戻る。`cognito_callback_urls` / `cognito_logout_urls` /
   `sentry_traces_sample_rate` などをローカルで渡している場合も、CI では既定値に戻る。
5. 最初の実行は `env=dev`、`target=backend` にして、plan の要約と apply の結果を確かめる。

## 権限の範囲と残っているリスク

- `notes-gha-deploy-<env>` は `notes-gha-*` ロールと OIDC プロバイダの変更、`sts:AssumeRole`（ロールの乗り継ぎ）、
  ci-bootstrap の state の書き換え、state バケットとロックテーブルの設定変更を明示的に拒否される。
- IAM は `notes-app-*` のロールとポリシーに限る。マネージドポリシーのアタッチは `aws:policy/service-role/*` と
  `notes-app-*` のカスタマー管理ポリシーだけ。ただしインラインポリシー（`iam:PutRolePolicy`）の中身は制限できないので、
  広い権限の `notes-app-*` ロールを作って Lambda に渡せば Deny を回避できる。塞ぐには `notes-app-*` ロールに
  permissions boundary を付ける必要があり、今回は入れていない。
- `notes-gha-plan-<env>` は ECR リポジトリが MUTABLE なので `:latest` も上書きできる。ローカルの `make tf-plan` /
  `tf-apply` は `:latest` のダイジェストを使うので、ローカルで apply する前に plan のイメージを確かめる。
- `.terraform.lock.hcl` は git 管理外なので、CI は実行のたびにプロバイダを `~> 5.0` の範囲で解決する。
  ローカルの lock より新しいプロバイダで apply されると、次のローカル実行で `terraform init -upgrade` が要ることがある。
- CI のフロントビルドには `frontend/.env.local` も `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` も無い。
  `NEXT_PUBLIC_*` は Makefile が渡すので同じになるが、ローカルでソースマップを Sentry に上げているなら CI では上がらない。
