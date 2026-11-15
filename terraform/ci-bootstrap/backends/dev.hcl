# Same state bucket and lock table as the app root (../backends/dev.hcl), but a
# separate key: this root owns the GitHub Actions roles, not the app.
bucket         = "notes-app-terraform-state-031921999648"
key            = "notes-app/ci-bootstrap.tfstate"
region         = "ap-northeast-1"
encrypt        = true
dynamodb_table = "notes-app-terraform-locks"
