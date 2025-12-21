terraform {
  backend "s3" {
    bucket         = "notes-app-terraform-state-031921999648"
    key            = "terraform.tfstate"
    region         = "ap-northeast-1"
    encrypt        = true
    dynamodb_table = "notes-app-terraform-locks"
  }
}


