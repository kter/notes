# Same state bucket and lock table as the app root (../backends/prd.hcl), but a
# separate key: this root owns the GitHub Actions roles, not the app.
bucket         = "notes-app-terraform-state-401731371959"
key            = "notes-app/ci-bootstrap.tfstate"
region         = "ap-northeast-1"
encrypt        = true
dynamodb_table = "notes-app-terraform-locks"
