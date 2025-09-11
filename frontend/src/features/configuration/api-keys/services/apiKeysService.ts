import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/lib/api";
import {
  APIKey,
  CreateAPIKeyRequest,
  UpdateAPIKeyRequest,
  apiKeysListResponseSchema,
  apiKeyResponseSchema,
} from "../../schemas";

export class ApiKeysService {
  private static instance: ApiKeysService | null = null;

  private constructor() {}

  public static getInstance(): ApiKeysService {
    if (!ApiKeysService.instance) {
      ApiKeysService.instance = new ApiKeysService();
    }
    return ApiKeysService.instance;
  }

  // API Key methods
  async getApiKeys(): Promise<APIKey[]> {
    try {
      const response = await apiGet<{
        status: number;
        message: string;
        data: {
          apiKeys: APIKey[];
          total: number;
        };
      }>("configuration/api-key");

      const validatedResponse = apiKeysListResponseSchema.parse(response.data);
      return validatedResponse.apiKeys;
    } catch (error) {
      const apiError = error as ApiError;
      throw new Error(apiError.message || "Failed to fetch API keys");
    }
  }

  async getApiKey(id: string): Promise<APIKey> {
    try {
      const response = await apiGet<{
        status: number;
        message: string;
        data: {
          apiKey: APIKey;
        };
      }>(`configuration/api-key/${id}`);

      const validatedResponse = apiKeyResponseSchema.parse(
        response.data.data.apiKey
      );
      return validatedResponse.apiKey;
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.status === 404) {
        throw new Error("API key not found");
      }
      throw new Error(apiError.message || "Failed to fetch API key");
    }
  }

  async createApiKey(data: CreateAPIKeyRequest): Promise<APIKey> {
    try {
      const response = await apiPost<{
        status: number;
        message: string;
        data: {
          apiKey: APIKey;
        };
      }>("configuration/api-key", data);

      const validatedResponse = apiKeyResponseSchema.parse(response.data);
      return validatedResponse.apiKey;
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.status === 400) {
        throw new Error("Invalid API key data");
      }
      if (apiError.status === 409) {
        throw new Error("API key with this type already exists");
      }
      throw new Error(apiError.message || "Failed to create API key");
    }
  }

  async updateApiKey(id: string, data: UpdateAPIKeyRequest): Promise<APIKey> {
    try {
      const response = await apiPatch<{
        status: number;
        message: string;
        data: {
          apiKey: APIKey;
        };
      }>(`configuration/api-key/${id}`, data);

      const validatedResponse = apiKeyResponseSchema.parse(response.data);
      return validatedResponse.apiKey;
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.status === 404) {
        throw new Error("API key not found");
      }
      if (apiError.status === 400) {
        throw new Error("Invalid API key data");
      }
      if (apiError.status === 409) {
        throw new Error("API key with this type already exists");
      }
      throw new Error(apiError.message || "Failed to update API key");
    }
  }

  async deleteApiKey(id: string): Promise<void> {
    try {
      await apiDelete(`configuration/api-key/${id}`);
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.status === 404) {
        throw new Error("API key not found");
      }
      if (apiError.status === 409) {
        throw new Error("Cannot delete API key that is currently in use");
      }
      throw new Error(apiError.message || "Failed to delete API key");
    }
  }

  maskApiKey(apiKey: string): string {
    if (apiKey.length <= 8) {
      return "•".repeat(apiKey.length);
    }
    return `${apiKey.slice(0, 4)}${"•".repeat(32)}${apiKey.slice(-4)}`;
  }

  async copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    }
  }

  formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString();
    } catch {
      return dateString;
    }
  }
}

// Create and export the singleton instance
export const apiKeysService = ApiKeysService.getInstance();
