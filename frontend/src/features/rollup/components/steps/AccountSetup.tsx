"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  Shuffle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useFormContext, useController } from "react-hook-form";
import type { CreateRollupFormData } from "../../schemas/create-rollup";
import { useEthereumAccounts, wordList } from "../../hooks/useEthereumAccounts";
import * as bip39 from "bip39";
import { THANOS_STACK_PREREQUISITE_GUIDE_URL } from "../../const";

type AccountRole =
  | "adminAccount"
  | "proposerAccount"
  | "batchAccount"
  | "sequencerAccount";

export function AccountSetup() {
  const {
    register,
    setValue,
    control,
    formState: { errors },
  } = useFormContext<CreateRollupFormData>();

  const [showSeedPhrase, setShowSeedPhrase] = useState(false);
  const [seedPhraseConfirmed, setSeedPhraseConfirmed] = useState(false);

  const { field: seedPhraseField } = useController({
    name: "accountAndAws.seedPhrase",
    control,
    defaultValue: Array(12).fill(""),
  });

  const { field: l1RpcUrlField } = useController({
    name: "networkAndChain.l1RpcUrl",
    control,
    defaultValue: "https://rpc.sepolia.org",
  });

  const { field: adminAccountField } = useController({
    name: "accountAndAws.adminAccount",
    control,
    defaultValue: "",
  });

  const { field: proposerAccountField } = useController({
    name: "accountAndAws.proposerAccount",
    control,
    defaultValue: "",
  });

  const { field: batchAccountField } = useController({
    name: "accountAndAws.batchAccount",
    control,
    defaultValue: "",
  });

  const { field: sequencerAccountField } = useController({
    name: "accountAndAws.sequencerAccount",
    control,
    defaultValue: "",
  });

  const { accounts, isLoading, error } = useEthereumAccounts(
    seedPhraseField.value,
    l1RpcUrlField.value
  );

  const generateRandomSeedPhrase = useCallback(() => {
    // Generate a valid BIP39 mnemonic
    const mnemonic = bip39.generateMnemonic();
    const words = mnemonic.split(" ");
    seedPhraseField.onChange(words);

    // Reset all account selections since the addresses will change
    adminAccountField.onChange(undefined);
    proposerAccountField.onChange(undefined);
    batchAccountField.onChange(undefined);
    sequencerAccountField.onChange(undefined);
  }, [
    seedPhraseField,
    adminAccountField,
    proposerAccountField,
    batchAccountField,
    sequencerAccountField,
  ]);

  const handleSeedPhraseChange = useCallback(
    (index: number, value: string) => {
      // Check if the value contains multiple words (paste operation)
      const words = value.trim().toLowerCase().split(/\s+/);

      if (words.length > 1) {
        // If we have multiple words, update all inputs
        const newSeedPhrase = [...seedPhraseField.value];
        words.forEach((word, i) => {
          if (i < 12) {
            // Only accept valid BIP39 words
            if (wordList.includes(word)) {
              newSeedPhrase[i] = word;
            }
          }
        });
        seedPhraseField.onChange(newSeedPhrase);

        // Reset account selections when seed phrase changes
        adminAccountField.onChange(undefined);
        proposerAccountField.onChange(undefined);
        batchAccountField.onChange(undefined);
        sequencerAccountField.onChange(undefined);
      } else {
        // Single word update
        const word = value.trim().toLowerCase();
        // Only accept valid BIP39 words or empty string (for deletion)
        if (word === "" || wordList.includes(word)) {
          const newSeedPhrase = [...seedPhraseField.value];
          newSeedPhrase[index] = word;
          seedPhraseField.onChange(newSeedPhrase);

          // Reset account selections when seed phrase changes
          adminAccountField.onChange(undefined);
          proposerAccountField.onChange(undefined);
          batchAccountField.onChange(undefined);
          sequencerAccountField.onChange(undefined);
        }
      }
    },
    [
      seedPhraseField,
      adminAccountField,
      proposerAccountField,
      batchAccountField,
      sequencerAccountField,
    ]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Account Selection</h2>
        <p className="text-slate-600 mt-1">
          Enter your seed phrase to generate accounts. Select different accounts
          for each role.
        </p>
        <p className="text-blue-600 text-sm mt-1">
          Each account should have sufficient ETH balance for their respective
          operations.
        </p>
      </div>

      {/* Seed Phrase Section */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label className="text-lg font-semibold text-slate-800">
                Seed Phrase <span className="text-red-500">*</span>
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={generateRandomSeedPhrase}
                className="text-xs bg-transparent"
              >
                <Shuffle className="w-3 h-3 mr-1" />
                Generate Random
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowSeedPhrase(!showSeedPhrase)}
              >
                {showSeedPhrase ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {seedPhraseField.value.map((word: string, index: number) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-sm text-slate-500 w-6">{index + 1}</span>
                <Input
                  type={showSeedPhrase ? "text" : "password"}
                  value={word}
                  onChange={(e) =>
                    handleSeedPhraseChange(index, e.target.value)
                  }
                  placeholder="•••••"
                  className="text-sm"
                  list={`wordlist-${index}`}
                />
                <datalist id={`wordlist-${index}`}>
                  {wordList
                    .filter((w) => w.startsWith(word.toLowerCase()))
                    .slice(0, 10)
                    .map((suggestion) => (
                      <option key={suggestion} value={suggestion} />
                    ))}
                </datalist>
              </div>
            ))}
          </div>

          {/* Confirmation Checkbox */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="seedPhraseConfirm"
                checked={seedPhraseConfirmed}
                onCheckedChange={(checked) =>
                  setSeedPhraseConfirmed(checked === true)
                }
                className="mt-1"
              />
              <div className="flex-1">
                <label
                  htmlFor="seedPhraseConfirm"
                  className="flex items-start gap-2 cursor-pointer"
                >
                  <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <span className="font-semibold text-yellow-800">
                      Important:
                    </span>
                    <span className="text-yellow-700 ml-1">
                      I have written down my seed phrase and kept it safe. This
                      seed phrase is the only way to recover my accounts. I
                      understand I should never share it with anyone.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account Selection */}
      <div
        className={`space-y-4 transition-opacity duration-200 ${
          !seedPhraseConfirmed ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        {isLoading && (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            <span className="ml-2 text-sm text-slate-600">
              Generating accounts...
            </span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {!isLoading && !error && (
          <>
            {/* Admin Account */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">
                Admin Account <span className="text-red-500">*</span>
              </Label>
              <Select
                value={adminAccountField.value || undefined}
                onValueChange={(value) => {
                  adminAccountField.onChange(value);
                  const accountIndex = accounts.findIndex(
                    (acc) => acc.address === value
                  );
                  if (accountIndex !== -1) {
                    setValue(
                      "accountAndAws.adminPrivateKey",
                      accounts[accountIndex].privateKey
                    );
                  }
                }}
                disabled={
                  !seedPhraseConfirmed || isLoading || accounts.length === 0
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      accounts.length === 0
                        ? "No accounts available"
                        : "Select an account"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {accounts.length > 0 ? (
                    accounts.map((account, index) => (
                      <SelectItem key={index} value={account.address}>
                        <div className="flex items-center justify-between w-full">
                          <span className="font-mono text-sm">
                            {account.address}
                          </span>
                          <span className="text-xs text-slate-500 ml-4">
                            {account.balance}
                          </span>
                        </div>
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-accounts" disabled>
                      No accounts available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {errors.accountAndAws?.adminAccount && (
                <p className="text-sm text-red-500">
                  {errors.accountAndAws.adminAccount.message}
                </p>
              )}
            </div>

            {/* Proposer Account */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">
                Proposer Account <span className="text-red-500">*</span>
              </Label>
              <Select
                value={proposerAccountField.value || undefined}
                onValueChange={(value) => {
                  proposerAccountField.onChange(value);
                  const accountIndex = accounts.findIndex(
                    (acc) => acc.address === value
                  );
                  if (accountIndex !== -1) {
                    setValue(
                      "accountAndAws.proposerPrivateKey",
                      accounts[accountIndex].privateKey
                    );
                  }
                }}
                disabled={
                  !seedPhraseConfirmed || isLoading || accounts.length === 0
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      accounts.length === 0
                        ? "No accounts available"
                        : "Select an account"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {accounts.length > 0 ? (
                    accounts.map((account, index) => (
                      <SelectItem key={index} value={account.address}>
                        <div className="flex items-center justify-between w-full">
                          <span className="font-mono text-sm">
                            {account.address}
                          </span>
                          <span className="text-xs text-slate-500 ml-4">
                            {account.balance}
                          </span>
                        </div>
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-accounts" disabled>
                      No accounts available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {errors.accountAndAws?.proposerAccount && (
                <p className="text-sm text-red-500">
                  {errors.accountAndAws.proposerAccount.message}
                </p>
              )}
            </div>

            {/* Batch Account */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">
                Batch Account <span className="text-red-500">*</span>
              </Label>
              <Select
                value={batchAccountField.value || undefined}
                onValueChange={(value) => {
                  batchAccountField.onChange(value);
                  const accountIndex = accounts.findIndex(
                    (acc) => acc.address === value
                  );
                  if (accountIndex !== -1) {
                    setValue(
                      "accountAndAws.batchPrivateKey",
                      accounts[accountIndex].privateKey
                    );
                  }
                }}
                disabled={
                  !seedPhraseConfirmed || isLoading || accounts.length === 0
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      accounts.length === 0
                        ? "No accounts available"
                        : "Select an account"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {accounts.length > 0 ? (
                    accounts.map((account, index) => (
                      <SelectItem key={index} value={account.address}>
                        <div className="flex items-center justify-between w-full">
                          <span className="font-mono text-sm">
                            {account.address}
                          </span>
                          <span className="text-xs text-slate-500 ml-4">
                            {account.balance}
                          </span>
                        </div>
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-accounts" disabled>
                      No accounts available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {errors.accountAndAws?.batchAccount && (
                <p className="text-sm text-red-500">
                  {errors.accountAndAws.batchAccount.message}
                </p>
              )}
            </div>

            {/* Sequencer Account */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">
                Sequencer Account <span className="text-red-500">*</span>
              </Label>
              <Select
                value={sequencerAccountField.value || undefined}
                onValueChange={(value) => {
                  sequencerAccountField.onChange(value);
                  const accountIndex = accounts.findIndex(
                    (acc) => acc.address === value
                  );
                  if (accountIndex !== -1) {
                    setValue(
                      "accountAndAws.sequencerPrivateKey",
                      accounts[accountIndex].privateKey
                    );
                  }
                }}
                disabled={
                  !seedPhraseConfirmed || isLoading || accounts.length === 0
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      accounts.length === 0
                        ? "No accounts available"
                        : "Select an account"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {accounts.length > 0 ? (
                    accounts.map((account, index) => (
                      <SelectItem key={index} value={account.address}>
                        <div className="flex items-center justify-between w-full">
                          <span className="font-mono text-sm">
                            {account.address}
                          </span>
                          <span className="text-xs text-slate-500 ml-4">
                            {account.balance}
                          </span>
                        </div>
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-accounts" disabled>
                      No accounts available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {errors.accountAndAws?.sequencerAccount && (
                <p className="text-sm text-red-500">
                  {errors.accountAndAws.sequencerAccount.message}
                </p>
              )}
            </div>

            {/* Info Message */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
              <p className="text-sm text-slate-700">
                Make sure each selected account has sufficient ETH balance for
                their operations. The accounts will be used to sign transactions
                for their respective roles. See{" "}
                <Link
                  href={THANOS_STACK_PREREQUISITE_GUIDE_URL}
                  target="_blank"
                  className="text-blue-700 underline"
                >
                  here
                </Link>
                {" "}for more details.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
