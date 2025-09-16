"use client";

import React, { useState } from "react";
import { RollupDetailTabProps } from "../../../schemas/detail-tabs";
import { ChainConfigurationForm } from "./ChainConfigurationForm";
import { ThanosStack } from "../../../schemas/thanos";

export function SettingsTab({ stack }: RollupDetailTabProps) {
  const [currentStack, setCurrentStack] = useState<ThanosStack | undefined>(
    stack
  );

  const handleStackUpdate = (updatedStack: ThanosStack) => {
    setCurrentStack(updatedStack);
  };

  if (!currentStack) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <p className="text-slate-600">No stack data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ChainConfigurationForm
        stack={currentStack}
        onUpdate={handleStackUpdate}
      />
    </div>
  );
}
