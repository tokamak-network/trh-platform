import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { apiKeysService } from "../services/apiKeysService";
import { APIKey, APIKeyFormData } from "../../schemas";

const API_KEYS_QUERY_KEY = "api-keys";

export function useApiKeys() {
  const {
    data: apiKeys = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [API_KEYS_QUERY_KEY],
    queryFn: () => apiKeysService.getApiKeys(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    apiKeys,
    isLoading,
    error,
    refetch,
  };
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: APIKeyFormData) => apiKeysService.createApiKey(data),
    onSuccess: (newApiKey) => {
      queryClient.setQueryData<APIKey[]>([API_KEYS_QUERY_KEY], (oldData) => {
        return oldData ? [...oldData, newApiKey] : [newApiKey];
      });
      toast.success("API key created successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create API key");
    },
  });
}

export function useUpdateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<APIKeyFormData> }) =>
      apiKeysService.updateApiKey(id, data),
    onSuccess: (updatedApiKey) => {
      queryClient.setQueryData<APIKey[]>([API_KEYS_QUERY_KEY], (oldData) => {
        return oldData
          ? oldData.map((apiKey) =>
              apiKey.id === updatedApiKey.id ? updatedApiKey : apiKey
            )
          : [updatedApiKey];
      });
      toast.success("API key updated successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update API key");
    },
  });
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiKeysService.deleteApiKey(id),
    onSuccess: (_, deletedId) => {
      queryClient.setQueryData<APIKey[]>([API_KEYS_QUERY_KEY], (oldData) => {
        return oldData
          ? oldData.filter((apiKey) => apiKey.id !== deletedId)
          : [];
      });
      toast.success("API key deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete API key");
    },
  });
}

export function useApiKeyActions() {
  const [showSecrets, setShowSecrets] = useState<{ [key: string]: boolean }>(
    {}
  );

  const toggleSecretVisibility = (keyId: string) => {
    setShowSecrets((prev) => ({
      ...prev,
      [keyId]: !prev[keyId],
    }));
  };

  const copyToClipboard = async (text: string) => {
    try {
      await apiKeysService.copyToClipboard(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const maskApiKey = (apiKey: string) => {
    return apiKeysService.maskApiKey(apiKey);
  };

  const formatDate = (dateString: string) => {
    return apiKeysService.formatDate(dateString);
  };

  return {
    showSecrets,
    toggleSecretVisibility,
    copyToClipboard,
    maskApiKey,
    formatDate,
  };
}
