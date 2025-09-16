import { Button } from "@/components/ui/button";
import { RefreshCw, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { invalidateThanosStacks } from "../hooks/useThanosStack";
import { useIsFetching } from "@tanstack/react-query";
import { rollupKeys } from "../api/queries";

export function RollupHeader() {
  const router = useRouter();

  const handleCreateRollup = () => {
    router.push("/rollup/create");
  };
  const isFetchingStacks =
    useIsFetching({
      queryKey: rollupKeys.thanosStacks,
    }) > 0;

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Rollups Management
        </h1>
        <p className="text-muted-foreground">
          Manage and monitor your Layer 2 rollups
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          aria-label="Refresh rollups"
          variant="outline"
          size="icon"
          onClick={() => invalidateThanosStacks()}
        >
          <RefreshCw
            className={`w-4 h-4 ${isFetchingStacks ? "animate-spin" : ""}`}
          />
        </Button>
        <Button
          onClick={handleCreateRollup}
          variant="default"
          className="cursor-pointer"
        >
          <Zap className="w-4 h-4 mr-2" />
          Deploy New Rollup
        </Button>
      </div>
    </div>
  );
}
