data "archive_file" "lambda" {
  type        = "zip"
  source_file = "${path.module}/../../../backend/dist/index.js"
  output_path = "${path.module}/../../../backend/dist/lambda.zip"
}

module "data" {
  source     = "../../modules/data"
  table_name = "${var.name_prefix}-todos"
}

module "compute" {
  source          = "../../modules/compute"
  function_name   = "${var.name_prefix}-todos"
  table_name      = module.data.table_name
  table_arn       = module.data.table_arn
  lambda_zip_path = data.archive_file.lambda.output_path
}

module "auth" {
  source      = "../../modules/auth"
  name_prefix = var.name_prefix
}

module "api" {
  source               = "../../modules/api"
  name_prefix          = var.name_prefix
  region               = var.region
  user_pool_arn        = module.auth.user_pool_arn
  lambda_invoke_arn    = module.compute.invoke_arn
  lambda_function_name = module.compute.function_name
}

module "frontend" {
  source            = "../../modules/frontend"
  name_prefix       = var.name_prefix
  bucket_name       = var.site_bucket_name
  api_invoke_domain = module.api.invoke_domain
  api_stage_name    = module.api.stage_name
}
