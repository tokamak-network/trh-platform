import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, AlertCircle, Rocket, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useFormContext } from "react-hook-form";
import type { CreateRollupFormData } from "../../schemas/create-rollup";

interface DataItem {
  label: string;
  value: string | undefined;
  action?: React.ReactElement;
}

interface Section {
  title: string;
  data: DataItem[];
}

export function ReviewAndDeployStep() {
  const { watch } = useFormContext<CreateRollupFormData>();
  const formData = watch();
  const [showSecretKey, setShowSecretKey] = useState(false);

  const sections: (Section | false)[] = [
    {
      title: "Network & Chain",
      data: [
        { label: "Network", value: formData.networkAndChain.network },
        { label: "Chain Name", value: formData.networkAndChain.chainName },
        { label: "L1 RPC URL", value: formData.networkAndChain.l1RpcUrl },
      ],
    },
    {
      title: "Account Setup",
      data: [
        { label: "Admin Account", value: formData.accountAndAws.adminAccount },
        {
          label: "Proposer Account",
          value: formData.accountAndAws.proposerAccount,
        },
        { label: "Batch Account", value: formData.accountAndAws.batchAccount },
        {
          label: "Sequencer Account",
          value: formData.accountAndAws.sequencerAccount,
        },
      ],
    },
    {
      title: "AWS Configuration",
      data: [
        { label: "Account Name", value: formData.accountAndAws.accountName },
        { label: "AWS Access Key", value: formData.accountAndAws.awsAccessKey },
        {
          label: "AWS Secret Key",
          value: showSecretKey
            ? formData.accountAndAws.awsSecretKey
            : "••••••••",
          action: (
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4"
              onClick={() => setShowSecretKey(!showSecretKey)}
            >
              {showSecretKey ? (
                <EyeOff className="h-3 w-3" />
              ) : (
                <Eye className="h-3 w-3" />
              )}
            </Button>
          ),
        },
        { label: "AWS Region", value: formData.accountAndAws.awsRegion },
      ],
    },
    formData.daoCandidate ? {
      title: "DAO Candidate",
      data: [
        { label: "Amount", value: `${formData.daoCandidate.amount} TON` },
        { label: "Memo", value: formData.daoCandidate.memo },
        { label: "Name Information", value: formData.daoCandidate.nameInfo },
      ],
    } : false,
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Configuration Summary
          </CardTitle>
          <CardDescription>
            Review your rollup configuration before deployment
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {sections.filter(Boolean).map((section, index) => {
            if (!section) return null;
            return (
              <div key={section.title}>
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg">{section.title}</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {section.data.map((item) => (
                      <div key={item.label} className="space-y-1">
                        <p className="text-sm text-muted-foreground">
                          {item.label}
                        </p>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">
                            {item.value || "Not provided"}
                          </Badge>
                          {item.action}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {index < sections.filter(Boolean).length - 1 && (
                  <Separator className="my-6" />
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Deployment Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-blue-600" />
            Ready to Deploy
          </CardTitle>
          <CardDescription>
            Your rollup configuration is complete and ready for deployment
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <AlertCircle className="h-5 w-5 text-blue-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900">
                Deployment Notice
              </p>
              <p className="text-sm text-blue-700">
                This process will create AWS infrastructure and deploy your
                rollup. Please ensure all information is correct as this action
                cannot be undone.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
