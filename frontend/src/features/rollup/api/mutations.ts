import { useMutation } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import { useRouter } from "next/navigation";
import {
  deployRollup,
  deleteRollup,
  resumeRollup,
  stopRollup,
  updateChainConfiguration,
  ChainConfigurationUpdateRequest,
  createRegisterMetadataDAO,
} from "../services/rollupService";
import { CreateRegisterMetadataDAORequest } from "../schemas/register-metadata-dao";
import { invalidateThanosStacks } from "../hooks/useThanosStack";
import { queryClient } from "@/providers/query-provider";
import { rollupKeys } from "./queries";
export {
  useUninstallIntegrationMutation,
  useInstallBridgeMutation,
} from "@/features/integrations/api/mutations";

export const useDeployRollupMutation = (options?: {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}) => {
  const router = useRouter();

  return useMutation({
    mutationFn: deployRollup,
    onMutate: () => {
      toast.loading("Deploying your rollup...", {
        id: "deploy-rollup",
      });
    },
    onSuccess: () => {
      toast.success("Rollup deployment initiated successfully!", {
        id: "deploy-rollup",
      });
      invalidateThanosStacks();
      router.push("/rollup");
      options?.onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to deploy rollup", {
        id: "deploy-rollup",
      });
      options?.onError?.(error);
    },
  });
};

export const useDeleteRollupMutation = (options?: {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}) => {
  return useMutation({
    mutationFn: deleteRollup,
    onMutate: () => {
      toast.loading("Destroying rollup...", {
        id: "delete-rollup",
      });
    },
    onSuccess: (_data, id) => {
      toast.success("Rollup destruction initiated successfully!", {
        id: "delete-rollup",
      });
      invalidateThanosStacks();
      if (id) {
        queryClient.invalidateQueries({ queryKey: rollupKeys.thanosStack(id) });
        queryClient.invalidateQueries({
          queryKey: rollupKeys.thanosDeployments(id),
        });
      }
      options?.onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to destroy rollup", {
        id: "delete-rollup",
      });
      options?.onError?.(error);
    },
  });
};

export const useResumeRollupMutation = (options?: {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}) => {
  return useMutation({
    mutationFn: resumeRollup,
    onMutate: () => {
      toast.loading("Resuming rollup...", {
        id: "resume-rollup",
      });
    },
    onSuccess: (_data, id) => {
      toast.success("Rollup resume initiated successfully!", {
        id: "resume-rollup",
      });
      invalidateThanosStacks();
      if (id) {
        queryClient.invalidateQueries({ queryKey: rollupKeys.thanosStack(id) });
        queryClient.invalidateQueries({
          queryKey: rollupKeys.thanosDeployments(id),
        });
      }
      options?.onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to resume rollup", {
        id: "resume-rollup",
      });
      options?.onError?.(error);
    },
  });
};

export const useStopRollupMutation = (options?: {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}) => {
  return useMutation({
    mutationFn: stopRollup,
    onMutate: () => {
      toast.loading("Stopping rollup deployment...", {
        id: "stop-rollup",
      });
    },
    onSuccess: (_data, id) => {
      toast.success("Rollup deployment stopped successfully!", {
        id: "stop-rollup",
      });
      invalidateThanosStacks();
      if (id) {
        queryClient.invalidateQueries({ queryKey: rollupKeys.thanosStack(id) });
        queryClient.invalidateQueries({
          queryKey: rollupKeys.thanosDeployments(id),
        });
      }
      options?.onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to stop rollup deployment", {
        id: "stop-rollup",
      });
      options?.onError?.(error);
    },
  });
};

export const useUpdateChainConfigurationMutation = (options?: {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}) => {
  return useMutation({
    mutationFn: ({
      id,
      config,
    }: {
      id: string;
      config: ChainConfigurationUpdateRequest;
    }) => updateChainConfiguration(id, config),
    onMutate: () => {
      toast.loading("Updating chain configuration...", {
        id: "update-chain-config",
      });
    },
    onSuccess: (_data, { id }) => {
      toast.success("Chain configuration updated successfully!", {
        id: "update-chain-config",
      });
      invalidateThanosStacks();
      if (id) {
        queryClient.invalidateQueries({ queryKey: rollupKeys.thanosStack(id) });
      }
      options?.onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update chain configuration", {
        id: "update-chain-config",
      });
      options?.onError?.(error);
    },
  });
};

export const useCreateRegisterMetadataDAOMutation = (options?: {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}) => {
  return useMutation({
    mutationFn: ({
      id,
      request,
    }: {
      id: string;
      request: CreateRegisterMetadataDAORequest;
    }) => createRegisterMetadataDAO(id, request),
    onMutate: () => {
      toast.loading("Registering metadata...", {
        id: "register-metadata-dao",
      });
    },
    onSuccess: (_data, { id }) => {
      toast.success("Metadata registered successfully!", {
        id: "register-metadata-dao",
      });
      invalidateThanosStacks();
      if (id) {
        queryClient.invalidateQueries({ queryKey: rollupKeys.thanosStack(id) });
        queryClient.invalidateQueries({
          queryKey: rollupKeys.registerMetadataDAO(id),
        });
      }
      options?.onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to register metadata", {
        id: "register-metadata-dao",
      });
      options?.onError?.(error);
    },
  });
};
