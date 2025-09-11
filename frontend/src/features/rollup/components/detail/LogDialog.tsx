"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { useThanosDeploymentLogsQuery } from "@/features/rollup/api/queries";
import {
  ThanosDeployment,
  ThanosDeploymentLog,
} from "@/features/rollup/schemas/thanos-deployments";

interface LogDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Function to handle dialog open/close state */
  onOpenChange: (open: boolean) => void;
  /** The deployment to show logs for */
  deployment: ThanosDeployment | null;
  /** The stack ID for the deployment */
  stackId?: string;
  /** Optional log query options */
  queryOptions?: {
    limit?: number;
    refetchIntervalMs?: number;
  };
}

export function LogDialog({
  open,
  onOpenChange,
  deployment,
  stackId,
  queryOptions = {
    limit: 200,
    refetchIntervalMs: 5000,
  },
}: LogDialogProps) {
  const deploymentId = open && deployment?.id ? deployment.id : undefined;

  // State for realtime logging and line limit
  const [isRealtimeEnabled, setIsRealtimeEnabled] = React.useState(true);
  const [lineLimit, setLineLimit] = React.useState<number>(200);

  // Available line limit options
  const lineLimitOptions = [
    { value: 10, label: "10 lines" },
    { value: 50, label: "50 lines" },
    { value: 100, label: "100 lines" },
    { value: 200, label: "200 lines" },
    { value: 500, label: "500 lines" },
  ];

  const {
    data: logs = [],
    isLoading: isLogsLoading,
    isError: isLogsError,
    refetch: refetchLogs,
  } = useThanosDeploymentLogsQuery(stackId, deploymentId, {
    limit: lineLimit,
    refetchIntervalMs: isRealtimeEnabled
      ? queryOptions.refetchIntervalMs
      : false,
  });

  const stripAnsi = React.useCallback((input: string) => {
    const ansiPattern = new RegExp(String.raw`\x1b\[[0-9;]*[A-Za-z]`, "g");
    return input.replace(ansiPattern, "");
  }, []);

  const parseLogMessage = React.useCallback(
    (log: ThanosDeploymentLog): { timestamp: string; text: string } => {
      const fallbackTimestamp = log.created_at;
      let text = log.message;
      try {
        const parsed = JSON.parse(log.message);
        const rawText = parsed.msg ?? parsed.message ?? log.message;
        text = typeof rawText === "string" ? rawText : String(rawText);
        const ts = parsed.timestamp ?? fallbackTimestamp;
        return {
          timestamp: ts,
          text: stripAnsi(text).replaceAll("\r", "").replaceAll("\n", "\n"),
        };
      } catch {
        return {
          timestamp: fallbackTimestamp,
          text: stripAnsi(text).replaceAll("\r", "").replaceAll("\n", "\n"),
        };
      }
    },
    [stripAnsi]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-auto min-w-[700px] max-w-4xl max-h-[80vh] min-h-[80vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Deployment logs</DialogTitle>
          <DialogDescription>
            {deployment && (
              <span>
                Showing recent logs for{" "}
                <span className="font-medium">
                  {deployment.step.replace(/-/g, " ")}
                </span>
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Controls */}
        <div className="flex items-center justify-between gap-4 py-3 border-b flex-shrink-0">
          <div className="flex items-center gap-4">
            {/* Realtime Switch */}
            <div className="flex items-center gap-2">
              <Label htmlFor="realtime-switch" className="text-sm font-medium">
                Realtime
              </Label>
              <Switch
                id="realtime-switch"
                checked={isRealtimeEnabled}
                onCheckedChange={setIsRealtimeEnabled}
              />
            </div>

            {/* Line Limit Dropdown */}
            <div className="flex items-center gap-2">
              <Label htmlFor="line-limit" className="text-sm font-medium">
                Lines
              </Label>
              <Select
                value={lineLimit.toString()}
                onValueChange={(value) => setLineLimit(parseInt(value))}
              >
                <SelectTrigger id="line-limit" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {lineLimitOptions.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value.toString()}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchLogs()}
            className="inline-flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
          </Button>
        </div>

        <div className="flex flex-col flex-1 min-h-0 space-y-3">
          {isLogsLoading ? (
            <div className="flex items-center text-slate-600">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading logs...
            </div>
          ) : isLogsError ? (
            <div className="flex items-center text-red-600">
              <AlertCircle className="w-4 h-4 mr-2" /> Failed to load logs
            </div>
          ) : logs.length === 0 ? (
            <div className="text-slate-600">No logs available.</div>
          ) : (
            <div className="rounded-md border bg-slate-950 text-slate-100 flex-1 min-h-0 overflow-y-auto">
              <pre className="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed p-3 h-full">
                {logs
                  .map((log) => {
                    const item = parseLogMessage(log);
                    const dt = new Date(item.timestamp);
                    const ts = isNaN(dt.getTime())
                      ? item.timestamp
                      : dt.toLocaleString();
                    return `[${ts}] ${item.text}\n`;
                  })
                  .join("")}
              </pre>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
