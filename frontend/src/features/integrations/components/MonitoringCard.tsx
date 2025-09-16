"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Copy, CheckCircle, ExternalLink } from "lucide-react";

interface MonitoringCardProps {
  integration: {
    info?: {
      url?: string;
      username?: string;
      password?: string;
      alert_manager?: {
        Email?: {
          Enabled: boolean;
          SmtpFrom: string;
          SmtpSmarthost: string;
          AlertReceivers: string[];
          SmtpAuthPassword: string;
        };
        Telegram?: {
          Enabled: boolean;
          ApiToken: string;
          CriticalReceivers: {
            ChatId: string;
          }[];
        };
      };
    };
    config?: {
      loggingEnabled?: boolean;
    };
    log_path?: string;
  };
  copiedItem: string | null;
  copyToClipboard: (text: string, itemId: string) => void;
}

export function MonitoringCard({ integration, copiedItem, copyToClipboard }: MonitoringCardProps) {
  return (
    <div className="space-y-4">
      {integration.info?.url && (
        <div>
          <span className="font-medium text-gray-600">URL:</span>
          <div className="flex items-start gap-2 mt-1">
            <p className="text-gray-900 font-mono text-sm break-all flex-1">
              {integration.info.url}
            </p>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  copyToClipboard(integration.info?.url || "", "url")
                }
                className="h-6 w-6 p-0"
              >
                {copiedItem === "url" ? (
                  <CheckCircle className="w-3 h-3" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open(integration.info?.url || "", "_blank")}
                className="h-6 w-6 p-0"
              >
                <ExternalLink className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Configuration Summary */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="font-medium text-gray-600">Logging:</span>
          <span className="ml-2 text-gray-900">
            {integration.config?.loggingEnabled ? "Enabled" : "Disabled"}
          </span>
        </div>
        {(integration.info?.username || integration.info?.password) && (
          <>
            {integration.info.username && (
              <div>
                <span className="font-medium text-gray-600">Username:</span>
                <div className="flex items-center gap-2">
                  <p className="text-gray-900">{integration.info.username}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      copyToClipboard(
                        integration.info?.username || "",
                        "monitoring_username"
                      )
                    }
                    className="h-6 w-6 p-0"
                  >
                    {copiedItem === "monitoring_username" ? (
                      <CheckCircle className="w-3 h-3" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </Button>
                </div>
              </div>
            )}
            {integration.info?.password && (
              <div>
                <span className="font-medium text-gray-600">Password:</span>
                <div className="flex items-center gap-2">
                  <p className="text-gray-900">{integration.info.password}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      copyToClipboard(
                        integration.info?.password || "",
                        "monitoring_password"
                      )
                    }
                    className="h-6 w-6 p-0"
                  >
                    {copiedItem === "monitoring_password" ? (
                      <CheckCircle className="w-3 h-3" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {integration.info?.alert_manager && (
        <div className="border-t pt-3">
          <h4 className="font-medium text-gray-900 mb-2">Alert Manager</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {integration.info?.alert_manager?.Email && (
              <div className="p-3 rounded-lg bg-gray-50 border">
                <div className="font-medium text-gray-700 mb-2">Email Alerts</div>
                <div className="space-y-1">
                  <div>
                    <span className="text-gray-600">Status:</span>
                    <span className={`ml-2 px-2 py-1 rounded text-xs ${
                      integration.info?.alert_manager?.Email?.Enabled
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-600"
                    }`}>
                      {integration.info?.alert_manager?.Email?.Enabled
                        ? "Active"
                        : "Inactive"}
                    </span>
                  </div>
                  {integration.info?.alert_manager?.Email?.Enabled && (
                    <>
                      <div>
                        <span className="text-gray-600">SMTP Server:</span>
                        <span className="ml-2 text-gray-900 font-mono text-xs">
                          {integration.info?.alert_manager?.Email?.SmtpSmarthost}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">From:</span>
                        <span className="ml-2 text-gray-900">
                          {integration.info?.alert_manager?.Email?.SmtpFrom}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Alert Receivers:</span>
                        <span className="ml-2 text-gray-900">
                          {integration.info?.alert_manager?.Email
                            ?.AlertReceivers &&
                          integration.info?.alert_manager?.Email?.AlertReceivers
                            .length > 0
                            ? integration.info?.alert_manager?.Email?.AlertReceivers.join(
                                ", "
                              )
                            : "None"}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
            {integration.info?.alert_manager?.Telegram && (
              <div className="p-3 rounded-lg bg-gray-50 border">
                <div className="font-medium text-gray-700 mb-2">Telegram Alerts</div>
                <div className="space-y-1">
                  <div>
                    <span className="text-gray-600">Status:</span>
                    <span className={`ml-2 px-2 py-1 rounded text-xs ${
                      integration.info?.alert_manager?.Telegram?.Enabled
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-600"
                    }`}>
                      {integration.info?.alert_manager?.Telegram?.Enabled
                        ? "Active"
                        : "Inactive"}
                    </span>
                  </div>
                  {integration.info?.alert_manager?.Telegram?.Enabled && (
                    <div>
                      <span className="text-gray-600">Critical Receivers:</span>
                      <span className="ml-2 text-gray-900">
                        {integration.info?.alert_manager?.Telegram
                          ?.CriticalReceivers &&
                        integration.info?.alert_manager?.Telegram
                          ?.CriticalReceivers?.length > 0
                          ? integration.info?.alert_manager?.Telegram?.CriticalReceivers
                              .map((receiver) => receiver.ChatId)
                              .join(", ")
                          : "None"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {integration.log_path && (
        <div className="border-t pt-3">
          <span className="font-medium text-gray-600">Log Path:</span>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-gray-900 font-mono text-xs break-all flex-1">
              {integration.log_path}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                copyToClipboard(integration.log_path || "", "log_path")
              }
              className="h-6 w-6 p-0"
            >
              {copiedItem === "log_path" ? (
                <CheckCircle className="w-3 h-3" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function MonitoringCompactInfo({ integration }: { 
  integration: { 
    info?: { 
      url?: string; 
      username?: string; 
      password?: string; 
    }; 
  }; 
}) {
  return (
    <div className="text-sm text-gray-600">
      {integration.info?.url && (
        <p className="truncate">
          <span className="font-medium">URL:</span> {integration.info.url}
        </p>
      )}
      {(integration.info?.username || integration.info?.password) && (
        <p className="truncate">
          <span className="font-medium">Creds:</span>{" "}
          {integration.info.username || ""}
          {integration.info?.username && integration.info?.password
            ? " / "
            : ""}
          {integration.info?.password || ""}
        </p>
      )}
    </div>
  );
}
