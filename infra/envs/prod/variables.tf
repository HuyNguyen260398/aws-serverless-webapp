variable "region" {
  type        = string
  description = "AWS region to deploy all application resources into."
}

variable "name_prefix" {
  type    = string
  default = "todo-prod"
}

variable "site_bucket_name" {
  type        = string
  description = "Globally-unique S3 bucket name for the frontend."
}
