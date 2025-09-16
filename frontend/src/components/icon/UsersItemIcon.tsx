import * as React from "react";

export const UsersItemIcon: React.FC<
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
          d="M6.10573 7.24683C6.03906 7.24016 5.95906 7.24016 5.88573 7.24683C4.29906 7.1935 3.03906 5.8935 3.03906 4.2935C3.03906 2.66016 4.35906 1.3335 5.99906 1.3335C7.6324 1.3335 8.95906 2.66016 8.95906 4.2935C8.9524 5.8935 7.6924 7.1935 6.10573 7.24683Z"
          stroke="white"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M10.9382 2.6665C12.2316 2.6665 13.2716 3.71317 13.2716 4.99984C13.2716 6.25984 12.2716 7.2865 11.0249 7.33317C10.9716 7.3265 10.9116 7.3265 10.8516 7.33317"
          stroke="white"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M2.7725 9.7065C1.15917 10.7865 1.15917 12.5465 2.7725 13.6198C4.60583 14.8465 7.6125 14.8465 9.44583 13.6198C11.0592 12.5398 11.0592 10.7798 9.44583 9.7065C7.61917 8.4865 4.6125 8.4865 2.7725 9.7065Z"
          stroke="white"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12.2266 13.3335C12.7066 13.2335 13.1599 13.0402 13.5332 12.7535C14.5732 11.9735 14.5732 10.6868 13.5332 9.90683C13.1666 9.62683 12.7199 9.44016 12.2466 9.3335"
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
        d="M6.10573 7.24683C6.03906 7.24016 5.95906 7.24016 5.88573 7.24683C4.29906 7.1935 3.03906 5.8935 3.03906 4.2935C3.03906 2.66016 4.35906 1.3335 5.99906 1.3335C7.6324 1.3335 8.95906 2.66016 8.95906 4.2935C8.9524 5.8935 7.6924 7.1935 6.10573 7.24683Z"
        stroke="#6D758F"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.9382 2.6665C12.2316 2.6665 13.2716 3.71317 13.2716 4.99984C13.2716 6.25984 12.2716 7.2865 11.0249 7.33317C10.9716 7.3265 10.9116 7.3265 10.8516 7.33317"
        stroke="#6D758F"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.7725 9.7065C1.15917 10.7865 1.15917 12.5465 2.7725 13.6198C4.60583 14.8465 7.6125 14.8465 9.44583 13.6198C11.0592 12.5398 11.0592 10.7798 9.44583 9.7065C7.61917 8.4865 4.6125 8.4865 2.7725 9.7065Z"
        stroke="#6D758F"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.2266 13.3335C12.7066 13.2335 13.1599 13.0402 13.5332 12.7535C14.5732 11.9735 14.5732 10.6868 13.5332 9.90683C13.1666 9.62683 12.7199 9.44016 12.2466 9.3335"
        stroke="#6D758F"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
