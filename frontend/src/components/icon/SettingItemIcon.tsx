import * as React from "react";

export const SettingItemIcon: React.FC<
  { isSelected?: boolean } & React.SVGProps<SVGSVGElement>
> = ({ isSelected, ...props }) => {
  if (isSelected) {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M2 6.0734V9.92007C2 11.3334 2 11.3334 3.33333 12.2334L7 14.3534C7.55333 14.6734 8.45333 14.6734 9 14.3534L12.6667 12.2334C14 11.3334 14 11.3334 14 9.92674V6.0734C14 4.66674 14 4.66674 12.6667 3.76674L9 1.64674C8.45333 1.32674 7.55333 1.32674 7 1.64674L3.33333 3.76674C2 4.66674 2 4.66674 2 6.0734Z"
          stroke="white"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8 10C9.10457 10 10 9.10457 10 8C10 6.89543 9.10457 6 8 6C6.89543 6 6 6.89543 6 8C6 9.10457 6.89543 10 8 10Z"
          stroke="white"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2 6.0734V9.92007C2 11.3334 2 11.3334 3.33333 12.2334L7 14.3534C7.55333 14.6734 8.45333 14.6734 9 14.3534L12.6667 12.2334C14 11.3334 14 11.3334 14 9.92674V6.0734C14 4.66674 14 4.66674 12.6667 3.76674L9 1.64674C8.45333 1.32674 7.55333 1.32674 7 1.64674L3.33333 3.76674C2 4.66674 2 4.66674 2 6.0734Z"
        stroke="#6D758F"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 10C9.10457 10 10 9.10457 10 8C10 6.89543 9.10457 6 8 6C6.89543 6 6 6.89543 6 8C6 9.10457 6.89543 10 8 10Z"
        stroke="#6D758F"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
