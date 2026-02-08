# AWS Backup Vault
resource "aws_backup_vault" "main" {
  name = "${var.project_name}-backup-vault-${terraform.workspace}"
}

# AWS Backup Plan（日次バックアップ）
resource "aws_backup_plan" "dsql" {
  name = "${var.project_name}-dsql-backup-plan-${terraform.workspace}"

  rule {
    rule_name         = "daily-backup"
    target_vault_name = aws_backup_vault.main.name
    # 毎日午前3時（JST）にバックアップ
    schedule = "cron(0 18 * * ? *)" # UTC 18:00 = JST 03:00

    lifecycle {
      delete_after = terraform.workspace == "prd" ? 30 : 7 # prd: 30日, dev: 7日
    }

    # ポイントインタイムリカバリ有効化
    enable_continuous_backup = true
  }
}

# IAM Role for AWS Backup
resource "aws_iam_role" "backup" {
  name = "${var.project_name}-backup-role-${terraform.workspace}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "backup.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "backup" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
}

resource "aws_iam_role_policy_attachment" "backup_restore" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores"
}

# Backup Selection（DSQLクラスターを選択）
resource "aws_backup_selection" "dsql" {
  name         = "${var.project_name}-dsql-backup-${terraform.workspace}"
  plan_id      = aws_backup_plan.dsql.id
  iam_role_arn = aws_iam_role.backup.arn

  resources = [
    aws_dsql_cluster.main.arn
  ]
}
