import { Card, CardContent } from "@/components/ui/card";
import {
  Activity,
  CheckCircle,
  DollarSign,
  TrendingUp,
  Users,
} from "lucide-react";

interface RollupStatsProps {
  totalRollups: number;
  activeRollups: number;
  totalUsers: string;
  totalTVL: string;
}

export function RollupStats({
  totalRollups,
  activeRollups,
  totalUsers,
  totalTVL,
}: RollupStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
      <Card className="py-0">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Total Rollups
              </p>
              <p className="text-2xl font-bold">{totalRollups}</p>
              <p className="text-xs text-green-600 flex items-center mt-1">
                <TrendingUp className="w-3 h-3 mr-1" />
                +12% from last month
              </p>
            </div>
            <div className="p-2 bg-blue-100 rounded-full">
              <Activity className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="py-0">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Active Rollups
              </p>
              <p className="text-2xl font-bold">{activeRollups}</p>
              <p className="text-xs text-green-600 flex items-center mt-1">
                <TrendingUp className="w-3 h-3 mr-1" />
                +8% from last month
              </p>
            </div>
            <div className="p-2 bg-green-100 rounded-full">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
