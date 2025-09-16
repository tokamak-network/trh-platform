import { useState, useMemo } from "react";
import { RollupType } from "../schemas/rollup";
import { ThanosStack, ThanosStackStatus } from "../schemas/thanos";

interface UseRollupFilterProps {
  rollups: ThanosStack[];
}

interface UseRollupFilterReturn {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  typeFilter: string;
  setTypeFilter: (type: string) => void;
  networkFilter: string;
  setNetworkFilter: (network: string) => void;
  filteredRollups: ThanosStack[];
}

export function useRollupFilter({
  rollups,
}: UseRollupFilterProps): UseRollupFilterReturn {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [networkFilter, setNetworkFilter] = useState("all");

  const filteredRollups = useMemo(() => {
    return rollups.filter((stack) => {
      // Search by chain name
      const matchesSearch = stack.config.chainName
        .toLowerCase()
        .includes(searchTerm.toLowerCase());

      // Handle status filter using ThanosStackStatus values
      const matchesStatus =
        statusFilter === "all" || stack.status === statusFilter;

      // Handle type filter using RollupType enum
      const stackType =
        stack.type || (stack.config?.type ? stack.config.type : null);
      const matchesType = typeFilter === "all" || stackType === typeFilter;

      // Handle network filter
      const matchesNetwork =
        networkFilter === "all" ||
        stack.network.toLowerCase() === networkFilter.toLowerCase();

      return matchesSearch && matchesStatus && matchesType && matchesNetwork;
    });
  }, [rollups, searchTerm, statusFilter, typeFilter, networkFilter]);

  return {
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    typeFilter,
    setTypeFilter,
    networkFilter,
    setNetworkFilter,
    filteredRollups,
  };
}
