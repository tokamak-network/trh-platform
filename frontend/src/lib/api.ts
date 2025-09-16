/* eslint-disable @typescript-eslint/no-explicit-any */
import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
} from "axios";
import { env } from "next-runtime-env";

// API base configuration
const API_BASE_URL = `${
  env("NEXT_PUBLIC_API_BASE_URL") || "http://localhost:8000"
}/api/v1/`;

// Create axios instance with default configuration
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("accessToken")
        : null;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error: AxiosError) => {
    // Handle common error cases
    if (error.response?.status === 401) {
      // Unauthorized - redirect to login or refresh token
      if (typeof window !== "undefined") {
        localStorage.removeItem("accessToken");
      }
    }

    if (error.response?.status === 403) {
      // Forbidden - handle access denied
      console.error("Access denied");
    }

    return Promise.reject(error);
  }
);

// Generic API response type
export interface ApiResponse<T = any> {
  data: T;
  message?: string;
  success: boolean;
}

// Error response type
export interface ApiError {
  message: string;
  status: number;
  errors?: Record<string, string[]>;
}

// Helper function to handle API errors
export const handleApiError = (error: AxiosError): ApiError => {
  if (error.response) {
    // Server responded with error status
    return {
      message: (error.response.data as any)?.message || "An error occurred",
      status: error.response.status,
      errors: (error.response.data as any)?.errors,
    };
  } else if (error.request) {
    // Request was made but no response received
    return {
      message: "No response from server",
      status: 0,
    };
  } else {
    // Something else happened
    return {
      message: error.message || "An unexpected error occurred",
      status: 0,
    };
  }
};

// Generic GET request helper
export const apiGet = async <T = any>(
  url: string,
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> => {
  try {
    const response: AxiosResponse<ApiResponse<T>> = await apiClient.get(
      url,
      config
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error as AxiosError);
  }
};

// Generic POST request helper
export const apiPost = async <T = any>(
  url: string,
  data?: any,
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> => {
  try {
    const response: AxiosResponse<ApiResponse<T>> = await apiClient.post(
      url,
      data,
      config
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error as AxiosError);
  }
};

// Generic PUT request helper
export const apiPut = async <T = any>(
  url: string,
  data?: any,
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> => {
  try {
    const response: AxiosResponse<ApiResponse<T>> = await apiClient.put(
      url,
      data,
      config
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error as AxiosError);
  }
};

// Generic PATCH request helper
export const apiPatch = async <T = any>(
  url: string,
  data?: any,
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> => {
  try {
    const response: AxiosResponse<ApiResponse<T>> = await apiClient.patch(
      url,
      data,
      config
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error as AxiosError);
  }
};

// Generic DELETE request helper
export const apiDelete = async <T = any>(
  url: string,
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> => {
  try {
    const response: AxiosResponse<ApiResponse<T>> = await apiClient.delete(
      url,
      config
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error as AxiosError);
  }
};

// Export the configured axios instance for advanced use cases
export { apiClient };

// Export axios types for convenience
export type { AxiosRequestConfig, AxiosResponse, AxiosError };
