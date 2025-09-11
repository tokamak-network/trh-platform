"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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

const daoCandidateSchema = z.object({
  amount: z
    .number()
    .refine((val) => !Number.isNaN(val), { message: "Enter a valid number" })
    .gt(1000, { message: "Amount must be greater than 1000 TON" }),
  memo: z.string().min(1, { message: "Memo is required" }),
  nameInfo: z.string().optional(),
});

export type DaoCandidateFormData = z.infer<typeof daoCandidateSchema>;

interface InstallDaoCandidateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: DaoCandidateFormData) => void;
  isPending?: boolean;
}

export default function InstallDaoCandidateDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending = false,
}: InstallDaoCandidateDialogProps) {
  const form = useForm<DaoCandidateFormData>({
    resolver: zodResolver(daoCandidateSchema),
    defaultValues: { amount: 1000.1, memo: "", nameInfo: "" },
  });

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pendingData, setPendingData] =
    React.useState<DaoCandidateFormData | null>(null);

  const handleSubmit = form.handleSubmit((data) => {
    setPendingData(data);
    setConfirmOpen(true);
  });

  const handleConfirm = () => {
    if (!pendingData) return;
    onSubmit(pendingData);
  };

  const handleDialogChange = (next: boolean) => {
    if (!next) {
      form.reset();
    }
    onOpenChange(next);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogChange}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Staking/DAO Candidate Registration</DialogTitle>
            <DialogDescription>
              Enter details to register your DAO candidate. Amount must be
              greater than 1000 TON.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (TON)</Label>
              <Input
                id="amount"
                type="number"
                step="0.0000001"
                placeholder="1000.1"
                disabled={isPending}
                {...form.register("amount", { valueAsNumber: true })}
                className={
                  form.formState.errors.amount ? "border-destructive" : ""
                }
              />
              {form.formState.errors.amount && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.amount.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="nameInfo">Candidate Name</Label>
              <Input
                id="nameInfo"
                placeholder="Your candidate name"
                disabled={isPending}
                {...form.register("nameInfo")}
                className={
                  form.formState.errors.nameInfo ? "border-destructive" : ""
                }
              />
              {form.formState.errors.nameInfo && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.nameInfo.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="memo">Memo</Label>
              <Input
                id="memo"
                placeholder="Purpose or reference"
                disabled={isPending}
                {...form.register("memo")}
                className={
                  form.formState.errors.memo ? "border-destructive" : ""
                }
              />
              {form.formState.errors.memo && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.memo.message}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending || form.formState.isSubmitting}
              >
                Continue
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Registration</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to register this DAO candidate with the
              provided details?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={isPending}
              onClick={handleConfirm}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
