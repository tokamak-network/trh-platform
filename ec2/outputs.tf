output "instance_hostname" {
  value = aws_instance.trh_platform_ec2.public_dns
}

output "instance_public_ip" {
  value = aws_instance.trh_platform_ec2.public_ip
}

output "instance_private_ip" {
  value = aws_instance.trh_platform_ec2.private_ip
}

output "security_group_id" {
  value = aws_security_group.trh_platform_security_group.id
}