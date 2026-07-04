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

  # Remote state. `bucket`, `region`, and `dynamodb_table` are all supplied at
  # init time via -backend-config (see README / CI) — the bucket and lock
  # table are created once by infra/bootstrap, and their names are not fixed
  # here so a fork can pick its own.
  backend "s3" {
    key     = "prod/terraform.tfstate"
    encrypt = true
  }
}

provider "aws" {
  region = var.region
}
