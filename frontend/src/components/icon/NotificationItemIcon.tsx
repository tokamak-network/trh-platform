import * as React from "react";

export const NotificationItemIcon: React.FC<
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
          d="M12.668 5.3335C13.7725 5.3335 14.668 4.43807 14.668 3.3335C14.668 2.22893 13.7725 1.3335 12.668 1.3335C11.5634 1.3335 10.668 2.22893 10.668 3.3335C10.668 4.43807 11.5634 5.3335 12.668 5.3335Z"
          stroke="white"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4.66797 8.6665H8.0013"
          stroke="white"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4.66797 11.3335H10.668"
          stroke="white"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9.33203 1.3335H5.9987C2.66536 1.3335 1.33203 2.66683 1.33203 6.00016V10.0002C1.33203 13.3335 2.66536 14.6668 5.9987 14.6668H9.9987C13.332 14.6668 14.6654 13.3335 14.6654 10.0002V6.66683"
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
        d="M12.668 5.3335C13.7725 5.3335 14.668 4.43807 14.668 3.3335C14.668 2.22893 13.7725 1.3335 12.668 1.3335C11.5634 1.3335 10.668 2.22893 10.668 3.3335C10.668 4.43807 11.5634 5.3335 12.668 5.3335Z"
        stroke="#6D758F"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.66797 8.6665H8.0013"
        stroke="#6D758F"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.66797 11.3335H10.668"
        stroke="#6D758F"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.33203 1.3335H5.9987C2.66536 1.3335 1.33203 2.66683 1.33203 6.00016V10.0002C1.33203 13.3335 2.66536 14.6668 5.9987 14.6668H9.9987C13.332 14.6668 14.6654 13.3335 14.6654 10.0002V6.66683"
        stroke="#6D758F"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
