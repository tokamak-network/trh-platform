variable "region" {
  description = "The region to launch the instance"
  type        = string
  default     = "ap-northeast-2"
}

variable "instance_type" {
  description = "The type of instance to launch"
  type        = string
  default     = "t2.large"
}

variable "instance_name" {
  description = "The name of the instance"
  type        = string
  default     = "trh-platform-ec2"
}

variable "key_pair_name" {
  description = "The name of the AWS key pair to use for SSH access"
  type        = string
}

variable "public_key_path" {
  description = "Path to the public key file"
  type        = string
}

variable "admin_email" {
  description = "Default admin email for the platform"
  type        = string
  default     = "admin@gmail.com"
}

variable "admin_password" {
  description = "Default admin password for the platform"
  type        = string
  default     = "admin"
}