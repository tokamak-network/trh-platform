"use client";

import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { RPCUrl, RPCUrlFormData } from "../../schemas";
import { rpcUrlService } from "../services/rpcUrlService";

interface UseRpcUrlsState {
  rpcUrls: RPCUrl[];
  isLoading: boolean;
  error: string | null;
  isAdding: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  deletingId: string | null;
}

interface UseRpcUrlsReturn extends UseRpcUrlsState {
  addRpcUrl: (data: RPCUrlFormData) => Promise<void>;
  updateRpcUrl: (id: string, data: RPCUrlFormData) => Promise<void>;
  deleteRpcUrl: (id: string) => Promise<void>;
  refreshRpcUrls: () => Promise<void>;
  mainnetRpcUrls: RPCUrl[];
  testnetRpcUrls: RPCUrl[];
  executionLayerRpcUrls: RPCUrl[];
  beaconChainRpcUrls: RPCUrl[];
}

export function useRpcUrls(): UseRpcUrlsReturn {
  const [state, setState] = useState<UseRpcUrlsState>({
    rpcUrls: [],
    isLoading: true,
    error: null,
    isAdding: false,
    isUpdating: false,
    isDeleting: false,
    deletingId: null,
  });

  const fetchRpcUrls = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      const rpcUrls = await rpcUrlService.getAllRpcUrls();
      setState((prev) => ({ ...prev, rpcUrls, isLoading: false }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to fetch RPC URLs";
      setState((prev) => ({ ...prev, error: errorMessage, isLoading: false }));
      toast.error(errorMessage);
    }
  }, []);

  const addRpcUrl = useCallback(async (data: RPCUrlFormData) => {
    try {
      setState((prev) => ({ ...prev, isAdding: true, error: null }));

      const newRpcUrl = await rpcUrlService.createRpcUrl(data);

      setState((prev) => ({
        ...prev,
        rpcUrls: [...prev.rpcUrls, newRpcUrl],
        isAdding: false,
      }));

      toast.success("RPC URL added successfully");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to add RPC URL";
      setState((prev) => ({ ...prev, error: errorMessage, isAdding: false }));
      toast.error(errorMessage);
      throw error;
    }
  }, []);

  const updateRpcUrl = useCallback(async (id: string, data: RPCUrlFormData) => {
    try {
      setState((prev) => ({ ...prev, isUpdating: true, error: null }));

      const updatedRpcUrl = await rpcUrlService.updateRpcUrl(id, data);

      setState((prev) => ({
        ...prev,
        rpcUrls: prev.rpcUrls.map((rpcUrl) =>
          rpcUrl.id === id ? updatedRpcUrl : rpcUrl
        ),
        isUpdating: false,
      }));

      toast.success("RPC URL updated successfully");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to update RPC URL";
      setState((prev) => ({ ...prev, error: errorMessage, isUpdating: false }));
      toast.error(errorMessage);
      throw error;
    }
  }, []);

  const deleteRpcUrl = useCallback(async (id: string) => {
    try {
      setState((prev) => ({
        ...prev,
        isDeleting: true,
        deletingId: id,
        error: null,
      }));

      await rpcUrlService.deleteRpcUrl(id);

      setState((prev) => ({
        ...prev,
        rpcUrls: prev.rpcUrls.filter((rpcUrl) => rpcUrl.id !== id),
        isDeleting: false,
        deletingId: null,
      }));

      toast.success("RPC URL deleted successfully");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to delete RPC URL";
      setState((prev) => ({
        ...prev,
        error: errorMessage,
        isDeleting: false,
        deletingId: null,
      }));
      toast.error(errorMessage);
      throw error;
    }
  }, []);

  const refreshRpcUrls = useCallback(async () => {
    await fetchRpcUrls();
  }, [fetchRpcUrls]);

  // Computed values for filtering
  const mainnetRpcUrls = state.rpcUrls.filter(
    (rpcUrl) => rpcUrl.network === "Mainnet"
  );
  const testnetRpcUrls = state.rpcUrls.filter(
    (rpcUrl) => rpcUrl.network === "Testnet"
  );
  const executionLayerRpcUrls = state.rpcUrls.filter(
    (rpcUrl) => rpcUrl.type === "ExecutionLayer"
  );
  const beaconChainRpcUrls = state.rpcUrls.filter(
    (rpcUrl) => rpcUrl.type === "BeaconChain"
  );

  // Load RPC URLs on mount
  useEffect(() => {
    fetchRpcUrls();
  }, [fetchRpcUrls]);

  return {
    ...state,
    addRpcUrl,
    updateRpcUrl,
    deleteRpcUrl,
    refreshRpcUrls,
    mainnetRpcUrls,
    testnetRpcUrls,
    executionLayerRpcUrls,
    beaconChainRpcUrls,
  };
}
