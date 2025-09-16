export type ThanosDeploymentStatus =
  | "InProgress"
  | "Success"
  | "Failed"
  | "Pending"
  | "Stopped";

export interface ThanosDeploymentConfig {
  [key: string]: unknown;
}

export interface ThanosDeployment {
  id: string;
  stack_id: string;
  step: string;
  status: ThanosDeploymentStatus;
  log_path?: string;
  config?: ThanosDeploymentConfig;
  started_at: string;
  finished_at?: string;
}

export interface GetThanosDeploymentsResponse {
  deployments: ThanosDeployment[];
}

export interface ThanosDeploymentLog {
  id: string;
  stack_id: string;
  deployment_id: string;
  message: string;
  created_at: string;
}

export interface GetThanosDeploymentLogsResponse {
  logs: ThanosDeploymentLog[];
}
