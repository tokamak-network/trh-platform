"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Copy, CheckCircle, ExternalLink } from "lucide-react";

interface RegisterCandidateCardProps {
  integration: {
    info?: {
      url?: string;
      candidate_registration?: {
        candidate_memo: string;
        candidate_name: string;
        staking_amount: number;
        registration_time: string;
        rollup_config_address: string;
      };
      safe_wallet?: {
        owners: string[];
        address: string;
        threshold: number;
      };
    };
    log_path?: string;
  };
  copiedItem: string | null;
  copyToClipboard: (text: string, itemId: string) => void;
}

export function RegisterCandidateCard({ integration, copiedItem, copyToClipboard }: RegisterCandidateCardProps) {
  if (
    integration.info?.candidate_registration
  ) {
    const reg = integration.info?.candidate_registration;
    return (
      <div className="space-y-3">
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
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium text-gray-600">Candidate Name:</span>
            <p className="text-gray-900">{reg.candidate_name}</p>
          </div>
          <div>
            <span className="font-medium text-gray-600">Staking Amount:</span>
            <p className="text-gray-900">{reg.staking_amount} TON</p>
          </div>
          <div className="col-span-2">
            <span className="font-medium text-gray-600">Memo:</span>
            <p className="text-gray-900">{reg.candidate_memo}</p>
          </div>
          <div className="col-span-2">
            <span className="font-medium text-gray-600">
              Registration Time:
            </span>
            <p className="text-gray-900">{reg.registration_time}</p>
          </div>
          <div className="col-span-2">
            <span className="font-medium text-gray-600">
              Rollup Config Address:
            </span>
            <div className="flex items-center gap-2">
              <p className="text-gray-900 font-mono text-xs truncate flex-1">
                {reg.rollup_config_address}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  copyToClipboard(
                    reg.rollup_config_address,
                    "rollup_config_address"
                  )
                }
                className="h-6 w-6 p-0"
              >
                {copiedItem === "rollup_config_address" ? (
                  <CheckCircle className="w-3 h-3" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {integration.info.safe_wallet && (
          <div className="border-t pt-3">
            <h4 className="font-medium text-gray-900 mb-2">Safe Wallet</h4>
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium text-gray-600">Address:</span>
                <div className="flex items-center gap-2">
                  <p className="text-gray-900 font-mono text-xs truncate flex-1">
                    {integration.info.safe_wallet.address}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      copyToClipboard(
                        integration.info?.safe_wallet?.address || "",
                        "safe_wallet_address"
                      )
                    }
                    className="h-6 w-6 p-0"
                  >
                    {copiedItem === "safe_wallet_address" ? (
                      <CheckCircle className="w-3 h-3" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </Button>
                </div>
              </div>
              <div>
                <span className="font-medium text-gray-600">Threshold:</span>
                <p className="text-gray-900">
                  {integration.info.safe_wallet.threshold} of{" "}
                  {integration.info.safe_wallet.owners.length}
                </p>
              </div>
              <div>
                <span className="font-medium text-gray-600">Owners:</span>
                <div className="space-y-1">
                  {integration.info.safe_wallet.owners.map((owner, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <p className="text-gray-900 font-mono text-xs truncate flex-1">
                        {owner}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          copyToClipboard(owner, `safe_wallet_owner_${index}`)
                        }
                        className="h-6 w-6 p-0"
                      >
                        {copiedItem === `safe_wallet_owner_${index}` ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
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
                onClick={() => copyToClipboard(integration.log_path || "", "log")}
                className="h-6 w-6 p-0"
              >
                {copiedItem === "log" ? (
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

  return (
    <div className="text-sm text-gray-600">
      No additional information available
    </div>
  );
}

export function RegisterCandidateCompactInfo({ integration }: { 
  integration: { 
    info?: { 
      candidate_registration?: {
        candidate_name: string;
        staking_amount: number;
      };
    }; 
  }; 
}) {
  if (
    integration.info?.candidate_registration
  ) {
    const reg = integration.info?.candidate_registration;
    return (
      <div className="text-sm text-gray-600">
        <p>
          <span className="font-medium">Candidate:</span> {reg.candidate_name}
        </p>
        <p>
          <span className="font-medium">Stake:</span> {reg.staking_amount} TON
        </p>
      </div>
    );
  }

  return (
    <div className="text-sm text-gray-600">
      No additional information available
    </div>
  );
}
