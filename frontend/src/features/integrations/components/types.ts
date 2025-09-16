export interface BaseIntegrationInfo {
  url?: string;
  log_path?: string;
}

export interface CopyToClipboardFunction {
  (text: string, itemId: string): void;
}

export interface PluginCardProps {
  integration: {
    info?: BaseIntegrationInfo;
    [key: string]: unknown;
  };
  copiedItem: string | null;
  copyToClipboard: CopyToClipboardFunction;
}

export interface PluginCompactInfoProps {
  integration: {
    info?: BaseIntegrationInfo;
    [key: string]: unknown;
  };
}
