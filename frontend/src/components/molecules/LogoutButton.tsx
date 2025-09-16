import React from "react";
import { Button } from "@/components/ui/button";
import { useAuthContext } from "@/providers";
import { LogOut } from "lucide-react";

interface LogoutButtonProps {
  className?: string;
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

export const LogoutButton: React.FC<LogoutButtonProps> = ({
  className,
  variant = "ghost",
  size = "default",
}) => {
  const { logout } = useAuthContext();

  const handleLogout = () => {
    logout();
  };

  return (
    <Button
      onClick={handleLogout}
      variant={variant}
      size={size}
      className={className}
    >
      <LogOut className="h-4 w-4" />
    </Button>
  );
};
