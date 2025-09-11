import { useMutation } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import {
  uninstallIntegration,
  installBridgeIntegration,
  installBlockExplorerIntegration,
  installMonitoringIntegration,
  registerDaoCandidateIntegration,
  uninstallMonitoringIntegration,
} from "../services/integrationService";
import { queryClient } from "@/providers/query-provider";
import { integrationKeys } from "./queries";

export const useUninstallIntegrationMutation = (options?: {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}) => {
  return useMutation({
    mutationFn: ({
      stackId,
      type,
    }: {
      stackId: string;
      type: "bridge" | "block-explorer" | "monitoring" | "register-candidate";
    }) => uninstallIntegration(stackId, type),
    onMutate: () => {
      toast.loading("Uninstalling component...", {
        id: "uninstall-integration",
      });
    },
    onSuccess: (_data, variables) => {
      toast.success("Uninstall initiated successfully", {
        id: "uninstall-integration",
      });
      queryClient.invalidateQueries({
        queryKey: integrationKeys.list(variables.stackId),
      });
      options?.onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to uninstall component", {
        id: "uninstall-integration",
      });
      options?.onError?.(error);
    },
  });
};

export const useInstallBridgeMutation = (options?: {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}) => {
  return useMutation({
    mutationFn: ({ stackId }: { stackId: string }) =>
      installBridgeIntegration(stackId),
    onMutate: () => {
      toast.loading("Installing Bridge...", { id: "install-bridge" });
    },
    onSuccess: (_data, variables) => {
      toast.success("Bridge installation initiated", { id: "install-bridge" });
      queryClient.invalidateQueries({
        queryKey: integrationKeys.list(variables.stackId),
      });
      options?.onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to install bridge", {
        id: "install-bridge",
      });
      options?.onError?.(error);
    },
  });
};

export interface InstallBlockExplorerVariables {
  stackId: string;
  databaseUsername: string;
  databasePassword: string;
  coinmarketcapKey: string;
  walletConnectId: string;
}

export const useInstallBlockExplorerMutation = (options?: {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}) => {
  return useMutation({
    mutationFn: (variables: InstallBlockExplorerVariables) =>
      installBlockExplorerIntegration(variables.stackId, {
        databaseUsername: variables.databaseUsername,
        databasePassword: variables.databasePassword,
        coinmarketcapKey: variables.coinmarketcapKey,
        walletConnectId: variables.walletConnectId,
      }),
    onMutate: () => {
      toast.loading("Installing Block Explorer...", {
        id: "install-block-explorer",
      });
    },
    onSuccess: (_data, variables) => {
      toast.success("Block Explorer installation initiated", {
        id: "install-block-explorer",
      });
      queryClient.invalidateQueries({
        queryKey: integrationKeys.list(variables.stackId),
      });
      options?.onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to install Block Explorer", {
        id: "install-block-explorer",
      });
      options?.onError?.(error);
    },
  });
};

export interface InstallMonitoringVariables {
  stackId: string;
  grafanaPassword: string;
  loggingEnabled: boolean;
  alertManager: {
    telegram: {
      enabled: boolean;
      apiToken: string;
      criticalReceivers: Array<{ chatId: string }>;
    };
    email: {
      enabled: boolean;
      smtpSmarthost: string;
      smtpFrom: string;
      smtpAuthPassword: string;
      alertReceivers: string[];
    };
  };
}

export const useInstallMonitoringMutation = (options?: {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}) => {
  return useMutation({
    mutationFn: (variables: InstallMonitoringVariables) =>
      installMonitoringIntegration(variables.stackId, {
        grafanaPassword: variables.grafanaPassword,
        loggingEnabled: variables.loggingEnabled,
        alertManager: variables.alertManager,
      }),
    onMutate: () => {
      toast.loading("Installing Monitoring...", {
        id: "install-monitoring",
      });
    },
    onSuccess: (_data, variables) => {
      toast.success("Monitoring installation initiated", {
        id: "install-monitoring",
      });
      queryClient.invalidateQueries({
        queryKey: integrationKeys.list(variables.stackId),
      });
      options?.onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to install Monitoring", {
        id: "install-monitoring",
      });
      options?.onError?.(error);
    },
  });
};

export const useUninstallMonitoringMutation = (options?: {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}) => {
  return useMutation({
    mutationFn: ({ stackId }: { stackId: string }) =>
      uninstallMonitoringIntegration(stackId),
    onMutate: () => {
      toast.loading("Uninstalling Monitoring...", {
        id: "uninstall-monitoring",
      });
    },
    onSuccess: (_data, variables) => {
      toast.success("Monitoring uninstall initiated", {
        id: "uninstall-monitoring",
      });
      queryClient.invalidateQueries({
        queryKey: integrationKeys.list(variables.stackId),
      });
      options?.onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to uninstall Monitoring", {
        id: "uninstall-monitoring",
      });
      options?.onError?.(error);
    },
  });
};

export interface RegisterDaoCandidateVariables {
  stackId: string;
  amount: number;
  memo: string;
  nameInfo?: string;
}

export const useRegisterDaoCandidateMutation = (options?: {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}) => {
  return useMutation({
    mutationFn: (variables: RegisterDaoCandidateVariables) =>
      registerDaoCandidateIntegration(variables.stackId, {
        amount: variables.amount,
        memo: variables.memo,
        nameInfo: variables.nameInfo,
      }),
    onMutate: () => {
      toast.loading("Registering DAO Candidate...", {
        id: "register-dao-candidate",
      });
    },
    onSuccess: (_data, variables) => {
      toast.success("DAO Candidate registration initiated", {
        id: "register-dao-candidate",
      });
      queryClient.invalidateQueries({
        queryKey: integrationKeys.list(variables.stackId),
      });
      options?.onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to register DAO Candidate", {
        id: "register-dao-candidate",
      });
      options?.onError?.(error);
    },
  });
};
