"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Eye,
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Hourglass,
  FileText,
  Download,
  Pause,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RollupDetailTabProps } from "../../../schemas/detail-tabs";
import { useThanosDeploymentsQuery } from "@/features/rollup/api/queries";
import { ThanosDeployment } from "@/features/rollup/schemas/thanos-deployments";
import { LogDialog } from "../LogDialog";
import { downloadThanosDeploymentLogs } from "@/features/rollup/services/rollupService";
import toast from "react-hot-toast";

const formatDateTime = (iso?: string) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString();
};

const formatDuration = (start?: string, end?: string) => {
  if (!start) return "-";
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs)
    return "-";
  const totalSeconds = Math.floor((endMs - startMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const StatusBadge = ({ status }: { status: ThanosDeployment["status"] }) => {
  const config = {
    InProgress: {
      className: "bg-blue-100 text-blue-700 border-blue-200",
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
    },
    Success: {
      className: "bg-green-100 text-green-700 border-green-200",
      icon: <CheckCircle className="w-3 h-3" />,
    },
    Failed: {
      className: "bg-red-100 text-red-700 border-red-200",
      icon: <AlertCircle className="w-3 h-3" />,
    },
    Pending: {
      className: "bg-gray-100 text-yellow-700 border-yellow-200",
      icon: <Hourglass className="w-3 h-3" />,
    },
    Stopped: {
      className: "bg-gray-100 text-gray-700 border-gray-200",
      icon: <Pause className="w-3 h-3" />,
    },
  } as const;
  const { className, icon } = config[status] || config.InProgress;
  return (
    <Badge variant="outline" className={`flex items-center gap-1 ${className}`}>
      {icon}
      {status}
    </Badge>
  );
};

export function DeploymentsTab({ stack }: RollupDetailTabProps) {
  // Hooks must be called unconditionally
  const stackId = stack?.id;
  const {
    data: deployments = [],
    isLoading,
    isError,
    refetch,
  } = useThanosDeploymentsQuery(stackId);
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<ThanosDeployment | null>(null);
  const [logsOpen, setLogsOpen] = React.useState(false);
  const [logsSelected, setLogsSelected] =
    React.useState<ThanosDeployment | null>(null);

  // Sort deployments by last activity (finished_at if present, otherwise started_at)
  const sortedDeployments = React.useMemo(() => {
    return [...deployments].sort((a, b) => {
      const aTime = new Date(a.finished_at ?? a.started_at).getTime();
      const bTime = new Date(b.finished_at ?? b.started_at).getTime();
      return bTime - aTime;
    });
  }, [deployments]);

  const StepnameMap: Record<string, string> = {
    "deploy-l1-contracts": "Deploy L1 Contracts",
    "deploy-aws-infra": "Deploy AWS Infrastructure",
    "destroy-aws-infra": "Destroy AWS Infrastructure",
    "install-bridge": "Install Bridge",
    "uninstall-bridge": "Uninstall Bridge",
    "install-block-explorer": "Install Block Explorer",
    "uninstall-block-explorer": "Uninstall Block Explorer",
    "install-monitoring": "Install Monitoring Dashboard",
    "uninstall-monitoring": "Uninstall Monitoring Dashboard",
    "register-candidate": "Staking/DAO Candidate Registration",
  };

  if (!stack) return null;

  const handleView = (deployment: ThanosDeployment) => {
    setSelected(deployment);
    setOpen(true);
  };

  const handleLogs = (deployment: ThanosDeployment) => {
    setLogsSelected(deployment);
    setLogsOpen(true);
  };

  const handleDownload = async (deployment: ThanosDeployment) => {
    if (!stackId) return;

    try {
      await downloadThanosDeploymentLogs(stackId, deployment.id);
    } catch (error) {
      console.error("Failed to download logs:", error);
      toast.error("Failed to download logs");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-xl bg-gradient-to-br from-slate-50 to-gray-100">
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="text-slate-800">Deployment history</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-slate-600">
              <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading
              deployment history...
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10">
              <div className="text-red-600 inline-flex items-center">
                <AlertCircle className="w-5 h-5 mr-2" /> Failed to load
                deployment history
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="inline-flex items-center"
              >
                <RefreshCw className="w-4 h-4 mr-2" /> Retry
              </Button>
            </div>
          ) : deployments.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-slate-600">
              No deployments found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-600">
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Started</th>
                    <th className="py-2 pr-4 font-medium">Duration</th>
                    <th className="py-2 pr-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDeployments.map((d) => {
                    const name = d.step.replace(/-/g, " ");
                    const duration =
                      d.status === "Success" || d.status === "Failed"
                        ? formatDuration(d.started_at, d.finished_at)
                        : formatDuration(d.started_at);
                    return (
                      <tr key={d.id} className="border-t border-slate-200/60">
                        <td className="py-3 pr-4 font-medium text-slate-800 capitalize">
                          {StepnameMap[d.step] || name}
                        </td>
                        <td className="py-3 pr-4">
                          <StatusBadge status={d.status} />
                        </td>
                        <td className="py-3 pr-4 text-slate-700">
                          {formatDateTime(d.started_at)}
                        </td>
                        <td className="py-3 pr-4 text-slate-700">{duration}</td>
                        <td className="py-3 pr-0 space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="inline-flex items-center"
                            onClick={() => handleView(d)}
                          >
                            <Eye className="w-4 h-4 mr-2" /> View
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="inline-flex items-center"
                            onClick={() => handleLogs(d)}
                          >
                            <FileText className="w-4 h-4 mr-2" /> Logs
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="inline-flex items-center"
                            onClick={() => handleDownload(d)}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Deployment details</DialogTitle>
            <DialogDescription>
              Information about this deployment run
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm overflow-y-auto flex-1 pr-2">
              <div className="grid grid-cols-3 gap-2">
                <div className="text-slate-600">Name</div>
                <div className="col-span-2 font-medium capitalize">
                  {selected.step.replace(/-/g, " ")}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-slate-600">Status</div>
                <div className="col-span-2">
                  <StatusBadge status={selected.status} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-slate-600">Created</div>
                <div className="col-span-2">
                  {formatDateTime(selected.started_at)}
                </div>
              </div>
              {selected.finished_at && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-slate-600">Finished</div>
                  <div className="col-span-2">
                    {formatDateTime(selected.finished_at)}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                <div className="text-slate-600">Duration</div>
                <div className="col-span-2">
                  {formatDuration(selected.started_at, selected.finished_at)}
                </div>
              </div>
              {selected.log_path && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-slate-600">Log Path</div>
                  <div className="col-span-2 font-mono text-xs break-words">
                    {selected.log_path}
                  </div>
                </div>
              )}
              {selected.config && (
                <div className="space-y-1">
                  <div className="text-slate-600">Config</div>
                  <pre className="bg-slate-100 rounded p-3 text-xs overflow-x-auto whitespace-pre-wrap break-words">
                    {JSON.stringify(selected.config, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <LogDialog
        open={logsOpen}
        onOpenChange={setLogsOpen}
        deployment={logsSelected}
        stackId={stackId}
      />
    </div>
  );
}
