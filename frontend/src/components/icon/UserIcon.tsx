import * as React from "react";

export const UserIcon: React.FC<React.SVGProps<SVGSVGElement>> = (
  isSelected
) => {
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
          d="M8.0013 8.00016C9.84225 8.00016 11.3346 6.50778 11.3346 4.66683C11.3346 2.82588 9.84225 1.3335 8.0013 1.3335C6.16035 1.3335 4.66797 2.82588 4.66797 4.66683C4.66797 6.50778 6.16035 8.00016 8.0013 8.00016Z"
          stroke="white"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M13.7268 14.6667C13.7268 12.0867 11.1601 10 8.0001 10C4.8401 10 2.27344 12.0867 2.27344 14.6667"
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
        d="M8.0013 8.00016C9.84225 8.00016 11.3346 6.50778 11.3346 4.66683C11.3346 2.82588 9.84225 1.3335 8.0013 1.3335C6.16035 1.3335 4.66797 2.82588 4.66797 4.66683C4.66797 6.50778 6.16035 8.00016 8.0013 8.00016Z"
        stroke="#6D758F"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.7268 14.6667C13.7268 12.0867 11.1601 10 8.0001 10C4.8401 10 2.27344 12.0867 2.27344 14.6667"
        stroke="#6D758F"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
