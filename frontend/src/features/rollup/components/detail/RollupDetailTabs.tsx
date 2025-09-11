"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThanosStack } from "../../schemas/thanos";
import { RollupDetailTab } from "../../schemas/detail-tabs";
import {
  OverviewTab,
  MonitoringTab,
  SettingsTab,
  LogsTab,
  DeploymentsTab,
  MetadataTab,
} from "./tabs";
import { ComponentsTab } from "@/features/integrations";

interface RollupDetailTabsProps {
  stack?: ThanosStack;
  currentTab?: RollupDetailTab;
}

export function RollupDetailTabs({
  stack,
  currentTab = "overview",
}: RollupDetailTabsProps) {
  const router = useRouter();

  const handleTabChange = (value: string) => {
    // Get the current pathname and search params
    const pathname = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);

    // Update the tab parameter
    searchParams.set("tab", value);

    // Navigate to the new URL
    router.push(`${pathname}?${searchParams.toString()}`);
  };

  return (
    <Tabs
      value={currentTab}
      onValueChange={handleTabChange}
      className="space-y-6"
    >
      <TabsList className="grid w-full grid-cols-5 bg-white/60 backdrop-blur-sm border-0 shadow-lg">
        <TabsTrigger
          value="overview"
          className="cursor-pointer data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-400 data-[state=active]:text-white data-[state=active]:shadow-lg font-medium"
        >
          Overview
        </TabsTrigger>
        <TabsTrigger
          value="deployments"
          className="cursor-pointer data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-400 data-[state=active]:text-white data-[state=active]:shadow-lg font-medium"
        >
          Deployment History
        </TabsTrigger>
        <TabsTrigger
          value="components"
          className="cursor-pointer data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-400 data-[state=active]:text-white data-[state=active]:shadow-lg font-medium"
        >
          Integrations
        </TabsTrigger>
        {/* <TabsTrigger
          value="monitoring"
          className="cursor-pointer data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-400 data-[state=active]:text-white data-[state=active]:shadow-lg font-medium"
        >
          Monitoring
        </TabsTrigger> */}
        <TabsTrigger
          value="metadata"
          className="cursor-pointer data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-400 data-[state=active]:text-white data-[state=active]:shadow-lg font-medium"
        >
          Metadata
        </TabsTrigger>
        <TabsTrigger
          value="settings"
          className="cursor-pointer data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-400 data-[state=active]:text-white data-[state=active]:shadow-lg font-medium"
        >
          Settings
        </TabsTrigger>
        {/* <TabsTrigger
          value="logs"
          className="cursor-pointer data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-400 data-[state=active]:text-white data-[state=active]:shadow-lg font-medium"
        >
          Logs
        </TabsTrigger> */}
      </TabsList>

      {/* Overview Tab */}
      <TabsContent value="overview" className="space-y-6">
        <OverviewTab stack={stack} />
      </TabsContent>

      {/* Components Tab */}
      <TabsContent value="components" className="space-y-6">
        <ComponentsTab stack={stack} />
      </TabsContent>

      {/* Monitoring Tab */}
      <TabsContent value="monitoring" className="space-y-6">
        <MonitoringTab stack={stack} />
      </TabsContent>

      {/* Deployments Tab */}
      <TabsContent value="deployments" className="space-y-6">
        <DeploymentsTab stack={stack} />
      </TabsContent>

      {/* Metadata Tab */}
      <TabsContent value="metadata" className="space-y-6">
        <MetadataTab stack={stack} />
      </TabsContent>

      {/* Settings Tab */}
      <TabsContent value="settings" className="space-y-6">
        <SettingsTab stack={stack} />
      </TabsContent>

      {/* Logs Tab */}
      <TabsContent value="logs" className="space-y-6">
        <LogsTab stack={stack} />
      </TabsContent>
    </Tabs>
  );
}
