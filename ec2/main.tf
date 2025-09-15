provider "aws" {
  region = var.region
}

data "aws_ami" "ubuntu" {
  most_recent = true

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
}

resource "aws_key_pair" "trh_platform_key" {
  key_name   = var.key_pair_name
  public_key = file(var.public_key_path)
  
  tags = {
    Name = "trh-platform-key"
  }
}

resource "aws_security_group" "trh_platform_security_group" {
  name_prefix = "trh-platform-sg-"
  description = "Security group for TRH application"

  # SSH access
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "SSH"
  }

  # Frontend port 3000
  ingress {
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Frontend port 3000"
  }

  # Backend port 8000
  ingress {
    from_port   = 8000
    to_port     = 8000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Backend port 8000"
  }

  # PostgreSQL port 5432
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "PostgreSQL"
  }

  # All outbound traffic
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound traffic"
  }

  tags = {
    Name = "trh-platform-security-group"
  }
}

resource "aws_instance" "trh_platform_ec2" {
  ami                    = "ami-00e73adb2e2c80366"
  instance_type          = var.instance_type
  key_name               = aws_key_pair.trh_platform_key.key_name
  vpc_security_group_ids = [aws_security_group.trh_platform_security_group.id]
  user_data = file("../install.sh")
  tags = {
    Name = var.instance_name
  }
}
