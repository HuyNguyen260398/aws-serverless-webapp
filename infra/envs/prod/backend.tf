terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }

  # Remote state. `bucket` and `region` are supplied at init time via
  # -backend-config (see README / CI). The lock table is created by infra/bootstrap.
  backend "s3" {
    key            = "prod/terraform.tfstate"
    dynamodb_table = "todo-tf-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.region
}
