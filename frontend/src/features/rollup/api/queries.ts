import { useQuery } from "@tanstack/react-query";
import {
  getRollups,
  getRollupById,
  getThanosStacks,
  getThanosStackById,
  getThanosDeployments,
  getThanosDeploymentLogs,
  getRegisterMetadataDAO,
} from "../services/rollupService";
import { getIntegrations } from "@/features/integrations/services/integrationService";

export const rollupKeys = {
  all: ["rollups"] as const,
  thanosStacks: ["thanosStacks"] as const,
  thanosStack: (id: string) => [...rollupKeys.thanosStacks, id] as const,
  thanosDeployments: (stackId: string) =>
    [...rollupKeys.thanosStack(stackId), "deployments"] as const,
  integrations: (stackId: string) =>
    [...rollupKeys.thanosStack(stackId), "integrations"] as const,
  registerMetadataDAO: (stackId: string) =>
    [...rollupKeys.thanosStack(stackId), "register-metadata-dao"] as const,
  lists: () => [...rollupKeys.all, "list"] as const,
  list: (filters: string) => [...rollupKeys.lists(), { filters }] as const,
  details: () => [...rollupKeys.all, "detail"] as const,
  detail: (id: string) => [...rollupKeys.details(), id] as const,
} as const;

export const useRollups = () => {
  return useQuery({
    queryKey: rollupKeys.lists(),
    queryFn: getRollups,
    refetchInterval: 120000, // 2 minutes
  });
};

export const useRollup = (id: string) => {
  return useQuery({
    queryKey: rollupKeys.detail(id),
    queryFn: () => getRollupById(id),
    refetchInterval: 120000, // 2 minutes
  });
};

export const useThanosStacksQuery = () => {
  return useQuery({
    queryKey: rollupKeys.thanosStacks,
    queryFn: getThanosStacks,
    retry: 2,
    refetchInterval: 120000, // 2 minutes
  });
};

export const useThanosStackByIdQuery = (id: string) => {
  return useQuery({
    queryKey: rollupKeys.thanosStack(id),
    queryFn: () => getThanosStackById(id),
    refetchInterval: 120000, // 2 minutes
  });
};

export { useIntegrationsQuery } from "@/features/integrations/api/queries";

export const useThanosDeploymentsQuery = (id?: string) => {
  return useQuery({
    queryKey: id
      ? rollupKeys.thanosDeployments(id)
      : (["thanosStacks", "deployments", "disabled"] as const),
    queryFn: () => getThanosDeployments(id as string),
    enabled: Boolean(id),
    refetchInterval: 10000, // 10 seconds
  });
};

export const useThanosDeploymentLogsQuery = (
  stackId?: string,
  deploymentId?: string,
  options?: {
    limit?: number;
    afterId?: string;
    refetchIntervalMs?: number | false;
  }
) => {
  return useQuery({
    queryKey:
      stackId && deploymentId
        ? [
            ...rollupKeys.thanosDeployments(stackId),
            deploymentId,
            "logs",
            options?.limit ?? 200,
            options?.afterId,
          ]
        : (["thanosStacks", "deployments", "logs", "disabled"] as const),
    queryFn: () =>
      getThanosDeploymentLogs(stackId as string, deploymentId as string, {
        limit: options?.limit,
        afterId: options?.afterId,
      }),
    enabled: Boolean(stackId && deploymentId),
    refetchInterval: options?.refetchIntervalMs ?? 5000,
  });
};

export const useRegisterMetadataDAOQuery = (id?: string) => {
  return useQuery({
    queryKey: id
      ? rollupKeys.registerMetadataDAO(id)
      : (["thanosStacks", "register-metadata-dao", "disabled"] as const),
    queryFn: () => getRegisterMetadataDAO(id as string),
    enabled: Boolean(id),
    refetchInterval: 120000, // 2 minutes
  });
};
