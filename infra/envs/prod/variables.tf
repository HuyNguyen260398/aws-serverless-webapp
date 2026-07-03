variable "region" {
  type    = string
  default = "us-east-1"
}

variable "name_prefix" {
  type    = string
  default = "todo-prod"
}

variable "site_bucket_name" {
  type        = string
  description = "Globally-unique S3 bucket name for the frontend."
}
