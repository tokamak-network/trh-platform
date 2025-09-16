import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/lib/api";
import {
  RPCUrl,
  CreateRPCUrlRequest,
  UpdateRPCUrlRequest,
  rpcUrlsListResponseSchema,
  rpcUrlResponseSchema,
} from "../../schemas";

class RPCUrlService {
  async getAllRpcUrls(): Promise<RPCUrl[]> {
    try {
      const response = await apiGet<{
        status: number;
        message: string;
        data: {
          rpcUrls: RPCUrl[];
          total: number;
        };
      }>("/configuration/rpc-url");

      const parsedData = rpcUrlsListResponseSchema.parse(response.data);
      return parsedData.rpcUrls;
    } catch (error) {
      console.error("Error fetching RPC URLs:", error);
      const apiError = error as ApiError;
      throw new Error(apiError.message || "Failed to fetch RPC URLs");
    }
  }

  async createRpcUrl(data: CreateRPCUrlRequest): Promise<RPCUrl> {
    try {
      const response = await apiPost<{
        status: number;
        message: string;
        data: {
          rpcUrl: RPCUrl;
        };
      }>("/configuration/rpc-url", data);

      const parsedData = rpcUrlResponseSchema.parse(response.data);
      return parsedData.rpcUrl;
    } catch (error) {
      console.error("Error creating RPC URL:", error);
      const apiError = error as ApiError;
      if (apiError.status === 400) {
        throw new Error("Invalid RPC URL data");
      }
      if (apiError.status === 409) {
        throw new Error("RPC URL with this name already exists");
      }
      throw new Error(apiError.message || "Failed to create RPC URL");
    }
  }

  async updateRpcUrl(id: string, data: UpdateRPCUrlRequest): Promise<RPCUrl> {
    try {
      const response = await apiPatch<{
        status: number;
        message: string;
        data: {
          rpcUrl: RPCUrl;
        };
      }>(`/configuration/rpc-url/${id}`, data);

      const parsedData = rpcUrlResponseSchema.parse(response.data);
      return parsedData.rpcUrl;
    } catch (error) {
      console.error("Error updating RPC URL:", error);
      const apiError = error as ApiError;
      if (apiError.status === 404) {
        throw new Error("RPC URL not found");
      }
      if (apiError.status === 400) {
        throw new Error("Invalid RPC URL data");
      }
      if (apiError.status === 409) {
        throw new Error("RPC URL with this name already exists");
      }
      throw new Error(apiError.message || "Failed to update RPC URL");
    }
  }

  async deleteRpcUrl(id: string): Promise<void> {
    try {
      await apiDelete(`/configuration/rpc-url/${id}`);
    } catch (error) {
      console.error("Error deleting RPC URL:", error);
      const apiError = error as ApiError;
      if (apiError.status === 404) {
        throw new Error("RPC URL not found");
      }
      if (apiError.status === 409) {
        throw new Error("Cannot delete RPC URL that is currently in use");
      }
      throw new Error(apiError.message || "Failed to delete RPC URL");
    }
  }

  // Utility function to copy text to clipboard
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

  // Utility function to mask RPC URL for security
  maskRpcUrl(rpcUrl: string): string {
    const urlObj = new URL(rpcUrl);
    const pathParts = urlObj.pathname.split("/");

    // If there's an API key in the path (like Alchemy), mask it
    if (pathParts.length > 1) {
      const lastPart = pathParts[pathParts.length - 1];
      if (lastPart && lastPart.length > 8) {
        pathParts[pathParts.length - 1] = lastPart.substring(0, 8) + "...";
        urlObj.pathname = pathParts.join("/");
      }
    }

    return urlObj.toString();
  }

  // Helper to get network badge color
  getNetworkBadgeColor(network: string): string {
    switch (network.toLowerCase()) {
      case "mainnet":
        return "bg-green-100 text-green-800";
      case "testnet":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  }

  // Helper to get type badge color
  getTypeBadgeColor(type: string): string {
    switch (type) {
      case "ExecutionLayer":
        return "bg-blue-100 text-blue-800";
      case "BeaconChain":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  }
}

export const rpcUrlService = new RPCUrlService();
