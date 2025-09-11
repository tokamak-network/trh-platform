"use client";

import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { awsCredentialsService } from "../services/awsCredentialsService";
import {
  AWSCredential,
  AWSCredentialFormData,
  ConfigurationState,
} from "../../schemas";
import toast from "react-hot-toast";

export const useAwsCredentials = () => {
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Query for AWS credentials
  const {
    data: awsCredentials = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["configuration", "aws-credentials"],
    queryFn: async () => {
      try {
        const result = await awsCredentialsService.getAwsCredentials();
        return result;
      } catch (error) {
        console.error("Error fetching AWS credentials:", error);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      console.error(`Query failed (attempt ${failureCount + 1}):`, error);
      return failureCount < 2; // Retry up to 2 times
    },
  });

  // Create AWS credential mutation
  const createCredentialMutation = useMutation({
    mutationFn: (data: AWSCredentialFormData) => {
      return awsCredentialsService.createAwsCredential(data);
    },
    onSuccess: (newCredential) => {
      queryClient.setQueryData(
        ["configuration", "aws-credentials"],
        (old: AWSCredential[] = []) => [...old, newCredential]
      );
      queryClient.invalidateQueries({
        queryKey: ["configuration", "aws-credentials"],
      });
      toast.success("AWS credentials added successfully");
    },
    onError: (error: Error) => {
      console.error("Error creating AWS credential:", error);
      toast.error(error.message || "Failed to add AWS credentials");
    },
  });

  // Update AWS credential mutation
  const updateCredentialMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: AWSCredentialFormData }) => {
      return awsCredentialsService.updateAwsCredential(id, data);
    },
    onSuccess: (updatedCredential) => {
      queryClient.setQueryData(
        ["configuration", "aws-credentials"],
        (old: AWSCredential[] = []) =>
          old.map((cred) =>
            cred.id === updatedCredential.id ? updatedCredential : cred
          )
      );
      queryClient.invalidateQueries({
        queryKey: ["configuration", "aws-credentials"],
      });
      toast.success("AWS credentials updated successfully");
    },
    onError: (error: Error) => {
      console.error("Error updating AWS credential:", error);
      toast.error(error.message || "Failed to update AWS credentials");
    },
  });

  // Delete AWS credential mutation
  const deleteCredentialMutation = useMutation({
    mutationFn: (id: string) => {
      return awsCredentialsService.deleteAwsCredential(id);
    },
    onMutate: (id: string) => {
      setDeletingId(id);
    },
    onSuccess: (_, deletedId) => {
      queryClient.setQueryData(
        ["configuration", "aws-credentials"],
        (old: AWSCredential[] = []) =>
          old.filter((cred) => cred.id !== deletedId)
      );
      queryClient.invalidateQueries({
        queryKey: ["configuration", "aws-credentials"],
      });
      toast.success("AWS credentials deleted successfully");
      setDeletingId(null);
    },
    onError: (error: Error) => {
      console.error("Error deleting AWS credential:", error);
      toast.error(error.message || "Failed to delete AWS credentials");
      setDeletingId(null);
    },
  });

  // Handler functions
  const addCredential = useCallback(
    (data: AWSCredentialFormData) => {
      createCredentialMutation.mutate(data);
    },
    [createCredentialMutation]
  );

  const updateCredential = useCallback(
    (id: string, data: AWSCredentialFormData) => {
      updateCredentialMutation.mutate({ id, data });
    },
    [updateCredentialMutation]
  );

  const deleteCredential = useCallback(
    (id: string) => {
      deleteCredentialMutation.mutate(id);
    },
    [deleteCredentialMutation]
  );

  const refreshCredentials = useCallback(() => {
    refetch();
  }, [refetch]);

  // Configuration state
  const configurationState: ConfigurationState = {
    awsCredentials,
    isLoading,
    error: error?.message || null,
  };

  return {
    // State
    ...configurationState,

    // Loading states
    isAdding: createCredentialMutation.isPending,
    isUpdating: updateCredentialMutation.isPending,
    isDeleting: deleteCredentialMutation.isPending,

    deletingId,

    // Actions
    addCredential,
    updateCredential,
    deleteCredential,

    refreshCredentials,

    // Utilities
    maskSecretKey: awsCredentialsService.maskSecretKey,
    copyToClipboard: awsCredentialsService.copyToClipboard,
  };
};
