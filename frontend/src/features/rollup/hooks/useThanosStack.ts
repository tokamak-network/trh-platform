import { useCallback, useMemo } from "react";
import {
  rollupKeys,
  useThanosStackByIdQuery,
  useThanosStacksQuery,
} from "../api/queries";
import { ThanosStack, ThanosStackStatus } from "../schemas/thanos";
import { queryClient } from "@/providers/query-provider";

interface UseThanosStackResult {
  stacks: ThanosStack[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  getStackByStatus: (status: ThanosStackStatus) => ThanosStack[];
}

export const invalidateThanosStacks = () => {
  queryClient.invalidateQueries({ queryKey: rollupKeys.thanosStacks });
};

export const useThanosStack = (): UseThanosStackResult => {
  const {
    data: stacks = [],
    isLoading,
    isError,
    error,
  } = useThanosStacksQuery();

  const getStackByStatus = useCallback(
    (status: ThanosStackStatus) => {
      return stacks.filter((stack) => stack.status === status);
    },
    [stacks]
  );

  return {
    stacks,
    isLoading,
    isError,
    error,
    getStackByStatus,
  };
};

export const useThanosStackById = (id: string) => {
  const {
    data: stack,
    isLoading,
    isError,
    error,
  } = useThanosStackByIdQuery(id);
  return {
    stack,
    isLoading,
    isError,
    error,
  };
};
