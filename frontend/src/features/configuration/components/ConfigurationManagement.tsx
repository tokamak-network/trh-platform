"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { ConfigurationTabs } from "./ConfigurationTabs";
import { ConfigurationTab } from "../schemas";

export function ConfigurationManagement() {
  const searchParams = useSearchParams();
  const currentTab = (searchParams.get("tab") as ConfigurationTab) || "aws";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Configuration</h1>
          <p className="text-muted-foreground">
            Manage credentials and configuration settings for your rollup
            platform
          </p>
        </div>
      </div>

      {/* Configuration Tabs */}
      <ConfigurationTabs currentTab={currentTab} />
    </div>
  );
}
