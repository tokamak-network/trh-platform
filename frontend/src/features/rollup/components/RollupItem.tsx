import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  MoreHorizontal,
  Play,
  Pause,
  Settings,
  Eye,
  Clock,
  ExternalLink,
  Trash2,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  Loader,
  RefreshCw,
  X,
  Globe,
  Server,
  LucideIcon,
  Layers,
  RotateCcw,
  PauseIcon,
} from "lucide-react";
import { statusConfig } from "../schemas/rollup";
import { ThanosStack, ThanosStackStatus } from "../schemas/thanos";
import { getLastActivityTime, formatRelativeTime } from "../utils/dateUtils";
import {
  useDeleteRollupMutation,
  useResumeRollupMutation,
  useStopRollupMutation,
} from "../api/mutations";

// Format rollup type for display
export const formatRollupType = (type: string): string => {
  switch (type.toLowerCase()) {
    case "optimistic-rollup":
      return "Optimistic Rollup";
    case "zk-rollup":
      return "ZK Rollup";
    default:
      return type;
  }
};

// Map of icon names to their components
export const IconMap: Record<string, LucideIcon> = {
  CheckCircle,
  Clock,
  Pause,
  Loader,
  RefreshCw,
  Trash2,
  X,
  AlertCircle,
  HelpCircle,
};

// Dynamic status icon component
export const StatusIcon = ({ iconName }: { iconName: string }) => {
  const Icon = IconMap[iconName];
  return Icon ? <Icon className="w-3 h-3" /> : null;
};

export const getStatusBadge = (status: ThanosStackStatus) => {
  const statusColors: Record<string, string> = {
    [ThanosStackStatus.PENDING]: statusConfig.Pending.color,
    [ThanosStackStatus.DEPLOYED]: statusConfig.Deployed.color,
    [ThanosStackStatus.STOPPED]: statusConfig.Stopped.color,
    [ThanosStackStatus.DEPLOYING]: statusConfig.Deploying.color,
    [ThanosStackStatus.UPDATING]: statusConfig.Updating.color,
    [ThanosStackStatus.TERMINATING]: statusConfig.Terminating.color,
    [ThanosStackStatus.TERMINATED]: statusConfig.Terminated.color,
    [ThanosStackStatus.FAILED_TO_DEPLOY]: statusConfig.FailedToDeploy.color,
    [ThanosStackStatus.FAILED_TO_UPDATE]: statusConfig.FailedToUpdate.color,
    [ThanosStackStatus.FAILED_TO_TERMINATE]:
      statusConfig.FailedToTerminate.color,
    [ThanosStackStatus.UNKNOWN]: statusConfig.Unknown.color,
  };

  const color = statusColors[status] || statusColors[ThanosStackStatus.UNKNOWN];
  return <div className={`w-3 h-3 rounded-full ${color}`} />;
};

interface RollupItemProps {
  stack: ThanosStack;
  onClick?: (id: string) => void;
  showActions?: boolean;
  className?: string;
}

export function RollupItem({
  stack,
  onClick,
  showActions = true,
  className = "",
}: RollupItemProps) {
  const statusInfo = statusConfig[stack.status];
  const deleteRollupMutation = useDeleteRollupMutation();
  const resumeRollupMutation = useResumeRollupMutation();
  const stopRollupMutation = useStopRollupMutation();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [isResumeDialogOpen, setIsResumeDialogOpen] = React.useState(false);
  const [isStopDialogOpen, setIsStopDialogOpen] = React.useState(false);

  // Check if resume button should be active
  const canResume = [
    ThanosStackStatus.STOPPED,
    ThanosStackStatus.TERMINATED,
    ThanosStackStatus.FAILED_TO_DEPLOY,
    ThanosStackStatus.FAILED_TO_UPDATE,
    ThanosStackStatus.FAILED_TO_TERMINATE,
  ].includes(stack.status);

  // Check if stop button should be active (only when deploying)
  const canStop = stack.status === ThanosStackStatus.DEPLOYING;
  // const canStop = false;

  // Disable destroy when stack is in-flight or mutation running
  const isDestroyDisabled =
    [
      ThanosStackStatus.DEPLOYING,
      ThanosStackStatus.UPDATING,
      ThanosStackStatus.TERMINATING,
      ThanosStackStatus.TERMINATED,
      ThanosStackStatus.PENDING,
    ].includes(stack.status) || deleteRollupMutation.isPending;

  const handleClick = () => {
    if (onClick) {
      onClick(stack.id);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    deleteRollupMutation.mutate(stack.id);
    setIsDeleteDialogOpen(false);
  };

  const handleResumeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResumeDialogOpen(true);
  };

  const handleConfirmResume = () => {
    resumeRollupMutation.mutate(stack.id);
    setIsResumeDialogOpen(false);
  };

  const handleStopClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsStopDialogOpen(true);
  };

  const handleConfirmStop = () => {
    stopRollupMutation.mutate(stack.id);
    setIsStopDialogOpen(false);
  };

  return (
    <Card
      key={stack.id}
      className={`${
        onClick
          ? "hover:shadow-md transition-all duration-200 cursor-pointer"
          : ""
      } ${className}`}
      onClick={onClick ? handleClick : undefined}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between px-10">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              {getStatusBadge(stack.status)}
              <div>
                <h3 className="text-lg font-semibold">
                  {stack.config.chainName}
                </h3>
                <div className="flex items-center space-x-4 mt-1">
                  <Badge
                    variant={statusInfo.variant}
                    className={`flex items-center gap-1 ${statusInfo.color}`}
                  >
                    <StatusIcon iconName={statusInfo.icon} />
                    {statusInfo.label}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="flex items-center gap-1 bg-gray-200"
                  >
                    <Globe className="w-3 h-3" />
                    {stack.network}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="flex items-center gap-1 bg-gray-200"
                  >
                    <Server className="w-3 h-3" />
                    {stack.name}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="flex items-center gap-1 bg-blue-100"
                  >
                    <Layers className="w-3 h-3" />
                    {formatRollupType(
                      stack.type ||
                        (stack.config?.type ? stack.config.type : "Unknown")
                    )}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="flex items-center gap-1 text-gray-500"
                  >
                    <Clock className="w-3 h-3" />
                    {formatRelativeTime(
                      getLastActivityTime(
                        stack.created_at,
                        stack.updated_at,
                        stack.deleted_at
                      )
                    )}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {showActions && (
            <div className="flex items-center space-x-6">
              {stack.metadata?.l2_url && (
                <div className="text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(stack.metadata?.l2_url, "_blank");
                    }}
                  >
                    <ExternalLink className="w-3 h-3" />
                    L2 URL
                  </Button>
                </div>
              )}

              {stack.metadata?.bridge_url && (
                <div className="text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(stack.metadata?.bridge_url, "_blank");
                    }}
                  >
                    <ExternalLink className="w-3 h-3" />
                    Bridge
                  </Button>
                </div>
              )}

              {stack.metadata?.block_explorer_url && (
                <div className="text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(stack.metadata?.block_explorer_url, "_blank");
                    }}
                  >
                    <ExternalLink className="w-3 h-3" />
                    Explorer
                  </Button>
                </div>
              )}

              {canStop && (
                <>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-orange-600 hover:text-orange-700 hover:bg-orange-50 cursor-pointer"
                          onClick={handleStopClick}
                        >
                          <PauseIcon width={16} height={16} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Stop Deployment</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <AlertDialog
                    open={isStopDialogOpen}
                    onOpenChange={setIsStopDialogOpen}
                  >
                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Stop Deployment</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to stop the deployment of{" "}
                          {stack.config.chainName}? This will halt the current
                          deployment process. You can resume the deployment later.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleConfirmStop}
                          className="bg-orange-600 hover:bg-orange-700 text-white"
                        >
                          Stop
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}

              {canResume && (
                <>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-green-600 hover:text-green-700 hover:bg-green-50 cursor-pointer"
                          onClick={handleResumeClick}
                        >
                          <RotateCcw width={16} height={16} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Resume Rollup</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <AlertDialog
                    open={isResumeDialogOpen}
                    onOpenChange={setIsResumeDialogOpen}
                  >
                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Resume Rollup</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to resume{" "}
                          {stack.config.chainName}? This will restart the rollup
                          deployment.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleConfirmResume}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          Resume
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}

              <>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={isDestroyDisabled}
                        onClick={handleDeleteClick}
                      >
                        <Trash2 width={16} height={16} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Destroy Rollup</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <AlertDialog
                  open={isDeleteDialogOpen}
                  onOpenChange={setIsDeleteDialogOpen}
                >
                  <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Destroy Rollup</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to destroy{" "}
                        {stack.config.chainName}? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleConfirmDelete}
                        disabled={isDestroyDisabled}
                        className="bg-red-600 hover:bg-red-700 text-white"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
