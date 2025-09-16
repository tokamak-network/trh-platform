import * as React from "react";

export const AnalyticsItemIcon: React.FC<
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
          d="M4.58594 12.1002V10.7202"
          stroke="white"
          strokeLinecap="round"
        />
        <path d="M8 12.0998V9.33984" stroke="white" strokeLinecap="round" />
        <path
          d="M11.4141 12.1003V7.95361"
          stroke="white"
          strokeLinecap="round"
        />
        <path
          d="M11.4126 3.8999L11.1059 4.2599C9.40594 6.24657 7.12594 7.65324 4.58594 8.28657"
          stroke="white"
          strokeLinecap="round"
        />
        <path
          d="M9.46094 3.8999H11.4143V5.84657"
          stroke="white"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M5.9987 14.6668H9.9987C13.332 14.6668 14.6654 13.3335 14.6654 10.0002V6.00016C14.6654 2.66683 13.332 1.3335 9.9987 1.3335H5.9987C2.66536 1.3335 1.33203 2.66683 1.33203 6.00016V10.0002C1.33203 13.3335 2.66536 14.6668 5.9987 14.6668Z"
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
        d="M4.58594 12.1002V10.7202"
        stroke="#6D758F"
        strokeLinecap="round"
      />
      <path d="M8 12.0998V9.33984" stroke="#6D758F" strokeLinecap="round" />
      <path
        d="M11.4141 12.1003V7.95361"
        stroke="#6D758F"
        strokeLinecap="round"
      />
      <path
        d="M11.4126 3.8999L11.1059 4.2599C9.40594 6.24657 7.12594 7.65324 4.58594 8.28657"
        stroke="#6D758F"
        strokeLinecap="round"
      />
      <path
        d="M9.46094 3.8999H11.4143V5.84657"
        stroke="#6D758F"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.9987 14.6668H9.9987C13.332 14.6668 14.6654 13.3335 14.6654 10.0002V6.00016C14.6654 2.66683 13.332 1.3335 9.9987 1.3335H5.9987C2.66536 1.3335 1.33203 2.66683 1.33203 6.00016V10.0002C1.33203 13.3335 2.66536 14.6668 5.9987 14.6668Z"
        stroke="#6D758F"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
