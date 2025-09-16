"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import type { CreateRollupFormData } from "../schemas/create-rollup";

interface RollupCreationState {
  formData: CreateRollupFormData | null;
  currentStep: number;
  hasUnsavedChanges: boolean;
}

interface RollupCreationContextType {
  state: RollupCreationState;
  updateFormData: (data: CreateRollupFormData) => void;
  updateCurrentStep: (step: number) => void;
  setHasUnsavedChanges: (hasChanges: boolean) => void;
  resetState: () => void;
}

const defaultFormData: CreateRollupFormData = {
  networkAndChain: {
    network: "",
    chainName: "",
    l1RpcUrl: "",
    l1BeaconUrl: "",
    advancedConfig: false,
    l2BlockTime: "2",
    batchSubmissionFreq: "1440",
    outputRootFreq: "240",
    challengePeriod: "12",
  },
  accountAndAws: {
    seedPhrase: Array(12).fill(""),
    adminAccount: "",
    adminPrivateKey: "",
    proposerAccount: "",
    proposerPrivateKey: "",
    batchAccount: "",
    batchPrivateKey: "",
    sequencerAccount: "",
    sequencerPrivateKey: "",
    accountName: "",
    credentialId: "",
    awsAccessKey: "",
    awsSecretKey: "",
    awsRegion: "",
  },
  daoCandidate: undefined,
};

const initialState: RollupCreationState = {
  formData: null,
  currentStep: 1,
  hasUnsavedChanges: false,
};

const RollupCreationContext = createContext<RollupCreationContextType | undefined>(undefined);

export function RollupCreationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RollupCreationState>(initialState);

  const updateFormData = (data: CreateRollupFormData) => {
    setState(prev => ({
      ...prev,
      formData: data,
      hasUnsavedChanges: true,
    }));
  };

  const updateCurrentStep = (step: number) => {
    setState(prev => ({
      ...prev,
      currentStep: step,
    }));
  };

  const setHasUnsavedChanges = (hasChanges: boolean) => {
    setState(prev => ({
      ...prev,
      hasUnsavedChanges: hasChanges,
    }));
  };

  const resetState = () => {
    setState(initialState);
  };

  return (
    <RollupCreationContext.Provider
      value={{
        state,
        updateFormData,
        updateCurrentStep,
        setHasUnsavedChanges,
        resetState,
      }}
    >
      {children}
    </RollupCreationContext.Provider>
  );
}

export function useRollupCreationContext() {
  const context = useContext(RollupCreationContext);
  if (context === undefined) {
    throw new Error("useRollupCreationContext must be used within a RollupCreationProvider");
  }
  return context;
}

export { defaultFormData };
