"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Eye, Link, Network, Zap, GitPullRequest } from "lucide-react";
import { RollupDetailTabProps } from "../../../schemas/detail-tabs";
import { TabsContent } from "@/components/ui/tabs";
import { formatDate } from "../../../utils/dateUtils";
import { downloadThanosRollupConfig } from "../../../services/rollupService";
import { useRegisterMetadataDAOQuery } from "../../../api/queries";
import toast from "react-hot-toast";

export function OverviewTab({ stack }: RollupDetailTabProps) {
  // Query to fetch metadata - must be called before any conditional returns
  const { data: metadataData } = useRegisterMetadataDAOQuery(stack?.id);

  if (!stack) return null;

  const rollup = {
    network: stack.network,
    l1ChainId: stack.metadata?.l1ChainId?.toString() || "Not available",
    l2ChainId: stack.metadata?.l2ChainId?.toString() || "Not available",
    rpcUrl: stack.metadata?.l2RpcUrl || "Not available",
    created: formatDate(stack.created_at),
    explorerUrl: stack.metadata?.explorerUrl || "#",
    bridgeUrl: stack.metadata?.bridgeUrl || "#",
    grafanaUrl: stack.metadata?.grafanaUrl || "#",
    layer1: stack.metadata?.layer1 || "Not available",
    layer2: stack.metadata?.layer2 || "Not available",
    metadataPrUrl: metadataData?.info?.pr_link || "#",
  };

  const handleDownloadConfig = async () => {
    if (!stack.id) return;

    try {
      await downloadThanosRollupConfig(stack.id);
    } catch (error) {
      console.error("Failed to download rollup config:", error);
      toast.error("Failed to download rollup config");
    }
  };

  return (
    <TabsContent value="overview" className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-0 shadow-xl bg-gradient-to-br from-blue-50 to-blue-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-800">
              <div className="p-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600">
                <Network className="h-4 w-4 text-white" />
              </div>
              Network Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: "Layer 1", value: rollup.layer1 },
              { label: "L1 Chain ID", value: rollup.l1ChainId, mono: true },
              { label: "Layer 2", value: rollup.layer2 },
              { label: "L2 Chain ID", value: rollup.l2ChainId, mono: true },
              {
                label: "RPC URL",
                value: rollup.rpcUrl,
                mono: true,
                link: true,
              },
              { label: "Created", value: rollup.created },
            ].map((item, index) => (
              <div
                key={index}
                className="flex justify-between items-center p-2 rounded-lg hover:bg-white/50 transition-colors duration-200"
              >
                <span className="text-sm font-medium text-slate-700">
                  {item.label}:
                </span>
                <span
                  className={`text-sm ${item.mono ? "font-mono" : ""} ${
                    item.link
                      ? "text-blue-600 hover:text-cyan-400"
                      : "text-slate-800"
                  } font-medium`}
                >
                  {item.value}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xl bg-gradient-to-br from-cyan-50 to-cyan-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-800">
              <div className="p-2 rounded-lg bg-gradient-to-r from-cyan-500 to-cyan-600">
                <Zap className="h-4 w-4 text-white" />
              </div>
              Quick Links
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rollup.explorerUrl !== "#" && (
              <Button
                variant="outline"
                className="w-full justify-start bg-white/60 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl hover:bg-gradient-to-r hover:from-blue-500 hover:to-cyan-400 hover:text-white transition-all duration-200"
                asChild
              >
                <a
                  href={rollup.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Block Explorer
                </a>
              </Button>
            )}
            {rollup.bridgeUrl !== "#" && (
              <Button
                variant="outline"
                className="w-full justify-start bg-white/60 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl hover:bg-gradient-to-r hover:from-blue-500 hover:to-cyan-400 hover:text-white transition-all duration-200"
                asChild
              >
                <a
                  href={rollup.bridgeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Link className="w-4 h-4 mr-2" />
                  Token Bridge
                </a>
              </Button>
            )}
            {rollup.grafanaUrl !== "#" && (
              <Button
                variant="outline"
                className="w-full justify-start bg-white/60 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl hover:bg-gradient-to-r hover:from-blue-500 hover:to-cyan-400 hover:text-white transition-all duration-200"
                asChild
              >
                <a
                  href={rollup.grafanaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Network className="h-4 w-4 mr-2" />
                  Grafana Dashboard
                </a>
              </Button>
            )}
            {rollup.metadataPrUrl !== "#" && (
              <Button
                variant="outline"
                className="w-full justify-start bg-white/60 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl hover:bg-gradient-to-r hover:from-blue-500 hover:to-cyan-400 hover:text-white transition-all duration-200"
                asChild
              >
                <a
                  href={rollup.metadataPrUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <GitPullRequest className="h-4 w-4 mr-2" />
                  Metadata PR
                </a>
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full justify-start bg-white/60 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl hover:bg-gradient-to-r hover:from-blue-500 hover:to-cyan-400 hover:text-white transition-all duration-200"
              onClick={handleDownloadConfig}
            >
              <Download className="w-4 h-4 mr-2" />
              Download Config
            </Button>
            {rollup.explorerUrl === "#" &&
              rollup.bridgeUrl === "#" &&
              rollup.grafanaUrl === "#" &&
              rollup.metadataPrUrl === "#" && (
                <div className="text-center py-4 text-slate-600">
                  No external links available for this rollup
                </div>
              )}
          </CardContent>
        </Card>
      </div>
    </TabsContent>
  );
}
