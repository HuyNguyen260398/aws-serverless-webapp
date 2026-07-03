output "distribution_id" {
  value = module.frontend.distribution_id
}
output "distribution_domain" {
  value = module.frontend.distribution_domain
}
output "site_bucket_name" {
  value = module.frontend.bucket_name
}
output "user_pool_id" {
  value = module.auth.user_pool_id
}
output "user_pool_client_id" {
  value = module.auth.user_pool_client_id
}
