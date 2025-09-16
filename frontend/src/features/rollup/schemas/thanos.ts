import { RollupType } from "./rollup";

export interface ThanosStackMetadata {
  // Legacy fields
  l2_url?: string;
  bridge_url?: string;
  block_explorer_url?: string;

  // New fields
  layer1?: string;
  layer2?: string;
  l2RpcUrl?: string;
  bridgeUrl?: string;
  l1ChainId?: number;
  l2ChainId?: number;
  grafanaUrl?: string;
  explorerUrl?: string;
  rollupConfigUrl?: string;
}

export interface ApiResponse {
  message: string;
  status: string;
}

export enum ThanosStackStatus {
  PENDING = "Pending",
  DEPLOYED = "Deployed",
  STOPPED = "Stopped",
  DEPLOYING = "Deploying",
  UPDATING = "Updating",
  TERMINATING = "Terminating",
  TERMINATED = "Terminated",
  FAILED_TO_DEPLOY = "FailedToDeploy",
  FAILED_TO_UPDATE = "FailedToUpdate",
  FAILED_TO_TERMINATE = "FailedToTerminate",
  UNKNOWN = "Unknown",
}

export interface ThanosStackConfig {
  network: string;
  type: RollupType;
  l1RpcUrl: string;
  awsRegion: string;
  chainName: string;
  l1BeaconUrl: string;
  l2BlockTime: number;
  adminAccount: string;
  awsAccessKey: string;
  batcherAccount: string;
  deploymentPath: string;
  challengePeriod: number;
  proposerAccount: string;
  sequencerAccount: string;
  awsSecretAccessKey: string;
  outputRootFrequency: number;
  batchSubmissionFrequency: number;
}

export interface ThanosStack {
  id: string;
  name: string;
  type?: string;
  network: string;
  config: ThanosStackConfig;
  deployment_path: string;
  status: ThanosStackStatus;
  metadata: ThanosStackMetadata | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface GetAllThanosStacksResponse extends ApiResponse {
  stacks: ThanosStack[];
}

export interface GetThanosStackResponse extends ApiResponse {
  stack: ThanosStack;
}
