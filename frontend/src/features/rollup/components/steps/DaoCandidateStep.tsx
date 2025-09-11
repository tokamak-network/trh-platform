import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFormContext } from "react-hook-form";
import Link from "next/link";
import type { CreateRollupFormData } from "../../schemas/create-rollup";
import { DAO_CANDIDATE_GUIDE_URL } from "../../const";

export function DaoCandidateStep() {
  const {
    register,
    formState: { errors },
  } = useFormContext<CreateRollupFormData>();

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">DAO Candidate Registration</h2>
          <p className="text-sm text-gray-500">
            Register your rollup as a DAO candidate by providing the required
            information. This step is optional.{" "}
            <Link
              href={DAO_CANDIDATE_GUIDE_URL}
              target="_blank"
              className="text-blue-600 underline hover:text-blue-800"
            >
              Learn more
            </Link>
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount" className="flex items-center gap-1">
              Amount <span className="text-red-500">*</span>
            </Label>
            <Input
              id="amount"
              type="number"
              step="0.1"
              placeholder="e.g. 1000.1 TON"
              {...register("daoCandidate.amount")}
            />
            {errors.daoCandidate?.amount && (
              <p className="text-sm text-red-500">
                {errors.daoCandidate.amount.message}
              </p>
            )}
            <p className="text-xs text-gray-500">
              Registration amount in TON (minimum 1000.1 TON)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="memo" className="flex items-center gap-1">
              Memo <span className="text-red-500">*</span>
            </Label>
            <Input
              id="memo"
              type="text"
              placeholder="Enter memo"
              {...register("daoCandidate.memo")}
            />
            {errors.daoCandidate?.memo && (
              <p className="text-sm text-red-500">
                {errors.daoCandidate.memo.message}
              </p>
            )}
            <p className="text-xs text-gray-500">
              Additional information or memo for the registration
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nameInfo" className="flex items-center gap-1">
              Name Information
            </Label>
            <Input
              id="nameInfo"
              type="text"
              placeholder="Enter name information"
              {...register("daoCandidate.nameInfo")}
            />
            {errors.daoCandidate?.nameInfo && (
              <p className="text-sm text-red-500">
                {errors.daoCandidate.nameInfo.message}
              </p>
            )}
            <p className="text-xs text-gray-500">
              Name or identifier information for the candidate
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
