export interface ChainMetadata {
  logo: string;
  website: string;
  description: string;
}

export interface BridgeMetadata {
  name: string;
}

export interface ExplorerMetadata {
  name: string;
}

export interface SupportResourcesMetadata {
  communityUrl: string;
  helpCenterUrl: string;
  statusPageUrl: string;
  announcementUrl: string;
  documentationUrl: string;
  supportContactUrl: string;
}

export interface RegisterMetadataDAOConfig {
  email: string;
  token: string;
  username: string;
  metadata: {
    chain: ChainMetadata;
    bridge: BridgeMetadata;
    explorer: ExplorerMetadata;
    supportResources: SupportResourcesMetadata;
  };
}

export interface RegisterMetadataDAOInfo {
  pr_link: string;
}

export interface RegisterMetadataDAOData {
  config: RegisterMetadataDAOConfig;
  info: RegisterMetadataDAOInfo;
}

export interface RegisterMetadataDAOResponse {
  status: number;
  message: string;
  data: RegisterMetadataDAOData;
}

export interface CreateRegisterMetadataDAORequest {
  email: string;
  token: string;
  username: string;
  metadata: {
    chain: ChainMetadata;
    bridge: BridgeMetadata;
    explorer: ExplorerMetadata;
    supportResources: SupportResourcesMetadata;
  };
}

export interface CreateRegisterMetadataDAOResponse {
  status: number;
  message: string;
  data: RegisterMetadataDAOData;
}
