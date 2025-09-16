import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, RefreshCw, AlertCircle } from "lucide-react";
import { useThanosStackById } from "../../hooks/useThanosStack";
import { RollupDetailHeader } from "./RollupDetailHeader";
import { RollupDetailTabs } from "./RollupDetailTabs";
import { RollupDetailTab } from "../../schemas/detail-tabs";

interface RollupDetailProps {
  id: string;
}

export function RollupDetail({ id }: RollupDetailProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const currentTab = (tabParam as RollupDetailTab) || "overview";
  const { stack, isLoading, isError } = useThanosStackById(id);

  const handleBackToRollups = () => {
    router.push("/rollup");
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <RefreshCw className="w-10 h-10 text-muted-foreground mx-auto mb-4 animate-spin" />
          <h3 className="text-lg font-semibold mb-2">
            Loading rollup details...
          </h3>
        </CardContent>
      </Card>
    );
  }

  if (isError || !stack) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">
            Error loading rollup details
          </h3>
          <p className="text-muted-foreground mb-6">
            There was a problem fetching the rollup details. Please try again
            later.
          </p>
          <Button onClick={() => window.location.reload()} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button
        variant="ghost"
        onClick={handleBackToRollups}
        className="mb-4 pl-2 hover:bg-gradient-to-r cursor-pointer transition-all duration-200 hover:text-blue-500"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Rollups
      </Button>

      {/* Header with rollup stats */}
      <RollupDetailHeader stack={stack} />

      {/* Tabs */}
      <RollupDetailTabs stack={stack} currentTab={currentTab} />
    </div>
  );
}
