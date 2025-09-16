import * as React from "react";
import { LayoutGrid } from "lucide-react";

export const DashboardItemIcon: React.FC<
  { isSelected?: boolean } & React.SVGProps<SVGSVGElement>
> = ({ isSelected, ...props }) => {
  return (
    <LayoutGrid
      size={16}
      className={isSelected ? "stroke-white" : "stroke-[#6D758F]"}
      {...props}
    />
  );
};
