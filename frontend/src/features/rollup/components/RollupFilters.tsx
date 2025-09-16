import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";
import { ThanosStackStatus } from "../schemas/thanos";
import { RollupType } from "../schemas/rollup";

interface RollupFiltersProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  typeFilter: string;
  setTypeFilter: (type: string) => void;
  networkFilter: string;
  setNetworkFilter: (network: string) => void;
}

export function RollupFilters({
  searchTerm,
  setSearchTerm,
  statusFilter,
  setStatusFilter,
  typeFilter,
  setTypeFilter,
  networkFilter,
  setNetworkFilter,
}: RollupFiltersProps) {
  return (
    <Card className="py-0">
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search rollups..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value={ThanosStackStatus.DEPLOYED}>
                Deployed
              </SelectItem>
              <SelectItem value={ThanosStackStatus.PENDING}>Pending</SelectItem>
              <SelectItem value={ThanosStackStatus.DEPLOYING}>
                Deploying
              </SelectItem>
              <SelectItem value={ThanosStackStatus.STOPPED}>Stopped</SelectItem>
              <SelectItem value={ThanosStackStatus.UPDATING}>
                Updating
              </SelectItem>
              <SelectItem value={ThanosStackStatus.TERMINATING}>
                Terminating
              </SelectItem>
              <SelectItem value={ThanosStackStatus.TERMINATED}>
                Terminated
              </SelectItem>
              <SelectItem value={ThanosStackStatus.FAILED_TO_DEPLOY}>
                Failed to Deploy
              </SelectItem>
              <SelectItem value={ThanosStackStatus.FAILED_TO_UPDATE}>
                Failed to Update
              </SelectItem>
              <SelectItem value={ThanosStackStatus.FAILED_TO_TERMINATE}>
                Failed to Terminate
              </SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value={RollupType.OPTIMISTIC_ROLLUP}>
                Optimistic Rollup
              </SelectItem>
              <SelectItem value={RollupType.ZK_ROLLUP}>ZK Rollup</SelectItem>
            </SelectContent>
          </Select>
          <Select value={networkFilter} onValueChange={setNetworkFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All Networks" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Networks</SelectItem>
              <SelectItem value="testnet">Testnet</SelectItem>
              <SelectItem value="mainnet">Mainnet</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
