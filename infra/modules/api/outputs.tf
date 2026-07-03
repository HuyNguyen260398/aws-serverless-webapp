output "api_id" {
  value = aws_api_gateway_rest_api.this.id
}
output "stage_name" {
  value = aws_api_gateway_stage.api.stage_name
}
output "invoke_domain" {
  value = "${aws_api_gateway_rest_api.this.id}.execute-api.${var.region}.amazonaws.com"
}
