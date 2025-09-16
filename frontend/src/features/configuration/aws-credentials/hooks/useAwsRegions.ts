"use client";

import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { awsCredentialsService } from "../services/awsCredentialsService";

export interface AwsRegion {
  value: string;
  label: string;
}

// Default region mappings for fallback
const DEFAULT_REGION_MAPPINGS: Record<string, string> = {
  "af-south-1": "Africa (Cape Town)",
  "ap-east-1": "Asia Pacific (Hong Kong)",
  "ap-east-2": "Asia Pacific (Taipei)",
  "ap-northeast-1": "Asia Pacific (Tokyo)",
  "ap-northeast-2": "Asia Pacific (Seoul)",
  "ap-northeast-3": "Asia Pacific (Osaka)",
  "ap-south-1": "Asia Pacific (Mumbai)",
  "ap-southeast-1": "Asia Pacific (Singapore)",
  "ap-southeast-2": "Asia Pacific (Sydney)",
  "ap-southeast-3": "Asia Pacific (Jakarta)",
  "ap-southeast-4": "Asia Pacific (Melbourne)",
  "ap-southeast-5": "Asia Pacific (Malaysia)",
  "ap-southeast-7": "Asia Pacific (Thailand)",
  "ca-central-1": "Canada (Central)",
  "ca-west-1": "Canada West (Calgary)",
  "eu-central-1": "Europe (Frankfurt)",
  "eu-central-2": "Europe (Zurich)",
  "eu-north-1": "Europe (Stockholm)",
  "eu-south-1": "Europe (Milan)",
  "eu-south-2": "Europe (Spain)",
  "eu-west-1": "Europe (Ireland)",
  "eu-west-2": "Europe (London)",
  "eu-west-3": "Europe (Paris)",
  "il-central-1": "Israel (Tel Aviv)",
  "me-central-1": "Middle East (UAE)",
  "me-south-1": "Middle East (Bahrain)",
  "mx-central-1": "Mexico (Central)",
  "sa-east-1": "South America (São Paulo)",
  "us-east-1": "US East (N. Virginia)",
  "us-east-2": "US East (Ohio)",
  "us-west-1": "US West (N. California)",
  "us-west-2": "US West (Oregon)",
};

const formatRegionLabel = (regionCode: string): string => {
  return DEFAULT_REGION_MAPPINGS[regionCode] || regionCode;
};

export const useAwsRegions = () => {
  const [regions, setRegions] = useState<AwsRegion[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Fetch AWS regions mutation
  const fetchRegionsMutation = useMutation({
    mutationFn: ({
      accessKeyId,
      secretAccessKey,
    }: {
      accessKeyId: string;
      secretAccessKey: string;
    }) => {
      return awsCredentialsService.getAwsRegions(accessKeyId, secretAccessKey);
    },
    onSuccess: (regionCodes: string[]) => {
      const formattedRegions: AwsRegion[] = regionCodes.map((code) => ({
        value: code,
        label: formatRegionLabel(code),
      }));
      setRegions(formattedRegions);
      setError(null);
    },
    onError: (error: Error) => {
      console.error("Error fetching AWS regions:", error);
      setError(error.message || "Failed to fetch AWS regions");
      setRegions([]);
    },
  });

  // Handler function
  const fetchRegions = useCallback(
    (accessKeyId: string, secretAccessKey: string) => {
      if (!accessKeyId || !secretAccessKey) {
        setError("Access Key ID and Secret Access Key are required");
        return;
      }

      setError(null);
      fetchRegionsMutation.mutate({ accessKeyId, secretAccessKey });
    },
    [fetchRegionsMutation]
  );

  // Clear regions and error
  const clearRegions = useCallback(() => {
    setRegions([]);
    setError(null);
  }, []);

  return {
    // State
    regions,
    error,

    // Loading state
    isLoading: fetchRegionsMutation.isPending,

    // Actions
    fetchRegions,
    clearRegions,
  };
};
