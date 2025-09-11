import * as React from "react";

export const RollupItemIcon: React.FC<
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
          d="M8.67172 1.94639L12.6051 3.69305C13.7384 4.19305 13.7384 5.01972 12.6051 5.51972L8.67172 7.26639C8.22505 7.46639 7.49172 7.46639 7.04505 7.26639L3.11172 5.51972C1.97839 5.01972 1.97839 4.19305 3.11172 3.69305L7.04505 1.94639C7.49172 1.74639 8.22505 1.74639 8.67172 1.94639Z"
          stroke="white"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M2 7.3335C2 7.8935 2.42 8.54016 2.93333 8.76683L7.46 10.7802C7.80667 10.9335 8.2 10.9335 8.54 10.7802L13.0667 8.76683C13.58 8.54016 14 7.8935 14 7.3335"
          stroke="white"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M2 10.6665C2 11.2865 2.36667 11.8465 2.93333 12.0998L7.46 14.1132C7.80667 14.2665 8.2 14.2665 8.54 14.1132L13.0667 12.0998C13.6333 11.8465 14 11.2865 14 10.6665"
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
        d="M8.67172 1.94639L12.6051 3.69305C13.7384 4.19305 13.7384 5.01972 12.6051 5.51972L8.67172 7.26639C8.22505 7.46639 7.49172 7.46639 7.04505 7.26639L3.11172 5.51972C1.97839 5.01972 1.97839 4.19305 3.11172 3.69305L7.04505 1.94639C7.49172 1.74639 8.22505 1.74639 8.67172 1.94639Z"
        stroke="#6D758F"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 7.3335C2 7.8935 2.42 8.54016 2.93333 8.76683L7.46 10.7802C7.80667 10.9335 8.2 10.9335 8.54 10.7802L13.0667 8.76683C13.58 8.54016 14 7.8935 14 7.3335"
        stroke="#6D758F"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 10.6665C2 11.2865 2.36667 11.8465 2.93333 12.0998L7.46 14.1132C7.80667 14.2665 8.2 14.2665 8.54 14.1132L13.0667 12.0998C13.6333 11.8465 14 11.2865 14 10.6665"
        stroke="#6D758F"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
