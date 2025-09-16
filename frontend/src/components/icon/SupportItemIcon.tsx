import * as React from "react";

export const SupportItemIcon: React.FC<
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
          d="M11.332 12.2868H8.66536L5.69869 14.2601C5.25869 14.5535 4.66536 14.2402 4.66536 13.7068V12.2868C2.66536 12.2868 1.33203 10.9535 1.33203 8.95349V4.95345C1.33203 2.95345 2.66536 1.62012 4.66536 1.62012H11.332C13.332 1.62012 14.6654 2.95345 14.6654 4.95345V8.95349C14.6654 10.9535 13.332 12.2868 11.332 12.2868Z"
          stroke="white"
          strokeMiterlimit="10"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8.00118 7.57324V7.43327C8.00118 6.97993 8.2812 6.73992 8.5612 6.54659C8.83453 6.35992 9.10783 6.11993 9.10783 5.67993C9.10783 5.0666 8.61451 4.57324 8.00118 4.57324C7.38785 4.57324 6.89453 5.0666 6.89453 5.67993"
          stroke="white"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M7.9983 9.16683H8.0043"
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
        d="M11.332 12.2868H8.66536L5.69869 14.2601C5.25869 14.5535 4.66536 14.2402 4.66536 13.7068V12.2868C2.66536 12.2868 1.33203 10.9535 1.33203 8.95349V4.95345C1.33203 2.95345 2.66536 1.62012 4.66536 1.62012H11.332C13.332 1.62012 14.6654 2.95345 14.6654 4.95345V8.95349C14.6654 10.9535 13.332 12.2868 11.332 12.2868Z"
        stroke="#6D758F"
        strokeMiterlimit="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.00118 7.57324V7.43327C8.00118 6.97993 8.2812 6.73992 8.5612 6.54659C8.83453 6.35992 9.10783 6.11993 9.10783 5.67993C9.10783 5.0666 8.61451 4.57324 8.00118 4.57324C7.38785 4.57324 6.89453 5.0666 6.89453 5.67993"
        stroke="#6D758F"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.9983 9.16683H8.0043"
        stroke="#6D758F"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
