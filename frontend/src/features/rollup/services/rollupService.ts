import { apiGet, apiPost, apiDelete, apiPut } from "@/lib/api";
import { Rollup, RollupType } from "../schemas/rollup";
import type { RollupDeploymentRequest } from "../schemas/create-rollup";
import { env } from "next-runtime-env";
import {
  GetAllThanosStacksResponse,
  GetThanosStackResponse,
  ThanosStack,
  ThanosStackStatus,
} from "../schemas/thanos";
import {
  ThanosDeployment,
  GetThanosDeploymentsResponse,
  GetThanosDeploymentLogsResponse,
  ThanosDeploymentLog,
} from "../schemas/thanos-deployments";
import {
  CreateRegisterMetadataDAORequest,
  RegisterMetadataDAOData,
} from "../schemas/register-metadata-dao";

export const deployRollup = async (request: RollupDeploymentRequest) => {
  const response = await apiPost<{ id: string }>("stacks/thanos", request, {
    timeout: 30000, // Increase timeout for deployment
  });
  return response;
};

export const mockRollups: Rollup[] = [
  {
    id: "1",
    name: "DeFi Rollup",
    status: "active",
    type: RollupType.OPTIMISTIC_ROLLUP,
    transactions: "2.4M",
    users: "45.2K",
    tvl: "$125M",
    uptime: "99.9%",
    lastActivity: "2 minutes ago",
    gasPrice: "0.001 ETH",
  },
  {
    id: "2",
    name: "Gaming Chain",
    status: "active",
    type: RollupType.ZK_ROLLUP,
    transactions: "1.8M",
    users: "32.1K",
    tvl: "$89M",
    uptime: "99.7%",
    lastActivity: "5 minutes ago",
    gasPrice: "0.0008 ETH",
  },
  {
    id: "3",
    name: "NFT Marketplace",
    status: "maintenance",
    type: RollupType.OPTIMISTIC_ROLLUP,
    transactions: "956K",
    users: "18.5K",
    tvl: "$45M",
    uptime: "98.2%",
    lastActivity: "1 hour ago",
    gasPrice: "0.0012 ETH",
  },
  {
    id: "4",
    name: "Social Network",
    status: "inactive",
    type: RollupType.ZK_ROLLUP,
    transactions: "234K",
    users: "8.2K",
    tvl: "$12M",
    uptime: "95.1%",
    lastActivity: "2 days ago",
    gasPrice: "0.0015 ETH",
  },
];

export const getRollups = (): Rollup[] => {
  return mockRollups;
};

export const getRollupById = (id: string): Rollup | undefined => {
  return mockRollups.find((rollup) => rollup.id === id);
};

export const getThanosStacks = async (): Promise<ThanosStack[]> => {
  const response = await apiGet<GetAllThanosStacksResponse>("stacks/thanos");

  return response.data.stacks;
};

export const getThanosStackById = async (id: string): Promise<ThanosStack> => {
  const response = await apiGet<GetThanosStackResponse>(`stacks/thanos/${id}`);
  return response.data.stack;
};

export const getThanosDeployments = async (
  id: string
): Promise<ThanosDeployment[]> => {
  const response = await apiGet<GetThanosDeploymentsResponse>(
    `stacks/thanos/${id}/deployments`
  );
  return response.data.deployments;
};

export const getThanosDeploymentLogs = async (
  stackId: string,
  deploymentId: string,
  params?: { limit?: number; afterId?: string }
): Promise<ThanosDeploymentLog[]> => {
  const response = await apiGet<GetThanosDeploymentLogsResponse>(
    `stacks/thanos/${stackId}/deployments/${deploymentId}/logs`,
    {
      params: {
        limit: params?.limit ?? 200,
        afterId: params?.afterId,
      },
    }
  );
  return response.data.logs;
};

export const downloadThanosDeploymentLogs = async (
  stackId: string,
  deploymentId: string
): Promise<void> => {
  try {
    const response = await fetch(
      `${
        env("NEXT_PUBLIC_API_BASE_URL") || "http://localhost:8000"
      }/api/v1/stacks/thanos/${stackId}/deployments/${deploymentId}/logs/download`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${
            typeof window !== "undefined"
              ? localStorage.getItem("accessToken")
              : ""
          }`,
        },
      }
    );

    if (!response.ok) {
      let errorMessage = "Failed to download logs";

      // Handle specific error cases based on backend response
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorMessage;
      } catch {
        // If response is not JSON, use status text
        errorMessage = response.statusText || errorMessage;
      }

      // Provide more specific error messages based on status codes
      switch (response.status) {
        case 400:
          throw new Error("Invalid stack ID or deployment ID format");
        case 404:
          throw new Error("Stack, deployment, or log file not found");
        case 500:
          throw new Error("Server error while accessing log file");
        default:
          throw new Error(errorMessage);
      }
    }

    // Get the filename from the Content-Disposition header or create a default one
    const contentDisposition = response.headers.get("content-disposition");
    let filename = `deployment-${deploymentId}-logs.log`;

    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(
        /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/
      );
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1].replace(/['"]/g, "");
      }
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Download failed:", error);
    throw error;
  }
};

export const downloadThanosRollupConfig = async (
  stackId: string
): Promise<void> => {
  try {
    const response = await fetch(
      `${
        env("NEXT_PUBLIC_API_BASE_URL") || "http://localhost:8000"
      }/api/v1/stacks/thanos/${stackId}/rollupconfig`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${
            typeof window !== "undefined"
              ? localStorage.getItem("accessToken")
              : ""
          }`,
        },
      }
    );

    if (!response.ok) {
      let errorMessage = "Failed to download rollup config";

      // Handle specific error cases based on backend response
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorMessage;
      } catch {
        // If response is not JSON, use status text
        errorMessage = response.statusText || errorMessage;
      }

      // Provide more specific error messages based on status codes
      switch (response.status) {
        case 400:
          throw new Error("Invalid stack ID format");
        case 404:
          throw new Error("Stack or rollup config not found");
        case 500:
          throw new Error("Server error while accessing rollup config");
        default:
          throw new Error(errorMessage);
      }
    }

    // Get the filename from the Content-Disposition header or create a default one
    const contentDisposition = response.headers.get("content-disposition");
    let filename = `rollup-config-${stackId}.json`;

    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(
        /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/
      );
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1].replace(/['"]/g, "");
      }
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Download failed:", error);
    throw error;
  }
};

export const deleteRollup = async (id: string) => {
  const response = await apiDelete<{ success: boolean }>(`stacks/thanos/${id}`);
  return response;
};

export const resumeRollup = async (id: string) => {
  const response = await apiPost<{ success: boolean }>(
    `stacks/thanos/${id}/resume`
  );
  return response;
};

export const stopRollup = async (id: string) => {
  const response = await apiPost<{ success: boolean }>(
    `stacks/thanos/${id}/stop`
  );
  return response;
};

export const calculateRollupStats = (stacks?: ThanosStack[]) => {
  if (!stacks || stacks.length === 0) {
    return {
      totalRollups: 0,
      activeRollups: 0,
      totalUsers: "0",
      totalTVL: "$0",
    };
  }

  const totalRollups = stacks.length;
  const activeRollups = stacks.filter(
    (stack) => stack.status === ThanosStackStatus.DEPLOYED
  ).length;

  // For now, we'll estimate users and TVL based on stack count
  // These can be updated with real metrics when available
  const estimatedUsersPerStack = 5000; // 5K users per stack estimation
  const estimatedTVLPerStack = 10; // $10M per stack estimation

  const totalUsers = totalRollups * estimatedUsersPerStack;
  const totalTVL = totalRollups * estimatedTVLPerStack;

  return {
    totalRollups,
    activeRollups,
    totalUsers: (totalUsers / 1000).toFixed(1) + "K",
    totalTVL: "$" + totalTVL.toFixed(0) + "M",
  };
};

// Interface for chain configuration update request
export interface ChainConfigurationUpdateRequest {
  l1RpcUrl: string;
  l1BeaconUrl: string;
}

// Update chain configuration for a Thanos stack
export const updateChainConfiguration = async (
  id: string,
  config: ChainConfigurationUpdateRequest
): Promise<void> => {
  await apiPut<{ stack: ThanosStack }>(`stacks/thanos/${id}`, config);
};

// Get register metadata DAO data for a Thanos stack
export const getRegisterMetadataDAO = async (
  id: string
): Promise<RegisterMetadataDAOData> => {
  const response = await apiGet<RegisterMetadataDAOData>(
    `stacks/thanos/${id}/integrations/register-metadata-dao`
  );
  return response.data;
};

// Create/update register metadata DAO for a Thanos stack
export const createRegisterMetadataDAO = async (
  id: string,
  request: CreateRegisterMetadataDAORequest
): Promise<RegisterMetadataDAOData> => {
  const response = await apiPost<RegisterMetadataDAOData>(
    `stacks/thanos/${id}/integrations/register-metadata-dao`,
    request
  );
  return response.data;
};
