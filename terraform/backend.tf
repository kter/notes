terraform {
  backend "s3" {
    bucket         = "notes-app-terraform-state"
    key            = "terraform.tfstate"
    region         = "ap-northeast-1"
    encrypt        = true
    dynamodb_table = "notes-app-terraform-locks"
  }
}
