/**
 * Formats a date string to a readable format
 * @param dateString ISO date string
 * @returns Formatted date string (e.g., "Jan 15, 2023")
 */
export const formatDate = (dateString: string): string => {
  if (!dateString) return "N/A";

  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

/**
 * Calculates the last activity time from created_at, updated_at and deleted_at timestamps
 * @param created_at Creation timestamp
 * @param updated_at Update timestamp
 * @param deleted_at Deletion timestamp (optional)
 * @returns The most recent timestamp
 */
export const getLastActivityTime = (
  created_at: string,
  updated_at: string,
  deleted_at: string | null
): string => {
  const timestamps = [
    new Date(created_at).getTime(),
    new Date(updated_at).getTime(),
  ];

  if (deleted_at) {
    timestamps.push(new Date(deleted_at).getTime());
  }

  return new Date(Math.max(...timestamps)).toISOString();
};

/**
 * Formats a timestamp to a relative time string (e.g., "5 minutes ago")
 * @param timestamp ISO timestamp string
 * @returns Formatted relative time string
 */
export const formatRelativeTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 0) {
    return "just now";
  }

  if (diffInSeconds < 60) {
    return `${diffInSeconds} second${diffInSeconds !== 1 ? "s" : ""} ago`;
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes !== 1 ? "s" : ""} ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours !== 1 ? "s" : ""} ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) {
    return `${diffInDays} day${diffInDays !== 1 ? "s" : ""} ago`;
  }

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return `${diffInMonths} month${diffInMonths !== 1 ? "s" : ""} ago`;
  }

  const diffInYears = Math.floor(diffInMonths / 12);
  return `${diffInYears} year${diffInYears !== 1 ? "s" : ""} ago`;
};
