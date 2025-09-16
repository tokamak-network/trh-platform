import React from "react";
import { Button } from "@/components/ui/button";

interface SidebarItemProps {
  icon: React.ComponentType<{ isSelected?: boolean }>;
  title: string;
  isSelected: boolean;
  onClick?: () => void;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({
  icon: Icon,
  title,
  isSelected,
  onClick,
}) => {
  return (
    <Button
      onClick={onClick}
      variant={isSelected ? "default" : "ghost"}
      size="default"
      className="flex w-full cursor-pointer justify-start gap-2 px-2 rounded-lg"
    >
      <Icon isSelected={isSelected} />
      <span className="text-sm font-medium">{title}</span>
    </Button>
  );
};
