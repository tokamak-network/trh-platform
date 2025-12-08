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
  user_data              = file("../install.sh")
  
  # Root volume configuration with 50GB storage
  root_block_device {
    volume_type = "gp3"
    volume_size = 50
    encrypted   = true
    delete_on_termination = true
    
    tags = {
      Name = "${var.instance_name}-root-volume"
    }
  }
  
  tags = {
    Name = var.instance_name
  }

  # SSH connection configuration
  connection {
    type        = "ssh"
    user        = "ubuntu"
    private_key = file("~/.ssh/${var.key_pair_name}")
    host        = self.public_ip
    timeout     = "10m"
    agent       = false
  }

  # Wait for the instance to be ready and basic installation to complete
  provisioner "remote-exec" {
    inline = [
      "echo 'Waiting for instance to be ready...'",
      "while [ ! -f /var/lib/cloud/instance/boot-finished ]; do echo 'Waiting for cloud-init to finish...'; sleep 10; done",
      "echo 'Instance is ready!'"
    ]
  }

  # Clone repository and run setup commands
  provisioner "remote-exec" {
    inline = [
      "set -e",
      "echo 'Starting TRH Platform setup...'",
      "cd /home/ubuntu",
      "git clone https://github.com/tokamak-network/trh-platform",
      "cd trh-platform",
      "echo 'Setting up environment configuration programmatically...'",
      "# Copy template files",
      "cp config/env.backend.template config/.env.backend",
      "cp config/env.frontend.template config/.env.frontend",
      "# Configure frontend with instance public IP",
      "sed -i 's|^NEXT_PUBLIC_API_BASE_URL=.*|NEXT_PUBLIC_API_BASE_URL=http://${self.public_ip}:8000|' config/.env.frontend",
      "# Configure backend with provided values",
      "sed -i 's|^DEFAULT_ADMIN_EMAIL=.*|DEFAULT_ADMIN_EMAIL=${var.admin_email}|' config/.env.backend",
      "sed -i 's|^DEFAULT_ADMIN_PASSWORD=.*|DEFAULT_ADMIN_PASSWORD=${var.admin_password}|' config/.env.backend",
      "echo 'Environment configuration completed!'",
      "echo 'Running make setup...'", 
      "make setup",
      "echo 'TRH Platform setup completed successfully!'"
    ]
  }
}
