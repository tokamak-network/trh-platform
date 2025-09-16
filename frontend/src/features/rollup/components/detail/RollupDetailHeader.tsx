import { ThanosStack } from "../../schemas/thanos";
import { RollupItem } from "../RollupItem";

interface RollupDetailHeaderProps {
  stack: ThanosStack;
}

export function RollupDetailHeader({ stack }: RollupDetailHeaderProps) {
  return <RollupItem stack={stack} className="border-0 shadow-none" />;
}
