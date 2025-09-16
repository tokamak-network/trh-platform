"use client";

import { useRouter } from "next/navigation";
import { RollupHeader } from "./RollupHeader";
import { RollupStats } from "./RollupStats";
import { RollupFilters } from "./RollupFilters";
import { RollupList } from "./RollupList";
import { useRollupFilter } from "../hooks/useRollupFilter";
import { useThanosStack } from "../hooks/useThanosStack";
import { calculateRollupStats } from "../services/rollupService";

export function RollupManagement() {
  const router = useRouter();
  const { stacks, isLoading } = useThanosStack();
  const stats = calculateRollupStats(stacks);

  const {
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    typeFilter,
    setTypeFilter,
    networkFilter,
    setNetworkFilter,
    filteredRollups,
  } = useRollupFilter({ rollups: stacks || [] });

  const handleCreateRollup = () => {
    router.push("/rollup/create");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <RollupHeader />

      {/* Stats */}
      <RollupStats
        totalRollups={stats.totalRollups}
        activeRollups={stats.activeRollups}
        totalUsers={stats.totalUsers}
        totalTVL={stats.totalTVL}
      />

      {/* Filters */}
      <RollupFilters
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        networkFilter={networkFilter}
        setNetworkFilter={setNetworkFilter}
      />

      {/* Rollups List */}
      <RollupList
        onCreateRollup={handleCreateRollup}
        filteredRollups={filteredRollups}
      />
    </div>
  );
}
