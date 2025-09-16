"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ethers } from "ethers";
import * as bip39 from "bip39";

export interface EthereumAccount {
  address: string;
  balance: string;
  privateKey: string;
}

export function useEthereumAccounts(seedPhrase: string[], rpcUrl: string) {
  const [accounts, setAccounts] = useState<EthereumAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Memoize the seed phrase string to prevent unnecessary regeneration
  const seedPhraseStr = useMemo(
    () => seedPhrase.join(" ").trim(),
    [seedPhrase]
  );

  // Memoize the account generation function
  const generateAccounts = useCallback(async () => {
    // Only proceed if we have all 12 words
    if (
      !seedPhraseStr ||
      seedPhrase.some((word) => !word) ||
      seedPhrase.length !== 12
    ) {
      setAccounts([]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Validate the mnemonic
      if (!bip39.validateMnemonic(seedPhraseStr)) {
        setError("Invalid seed phrase. Please check your words and try again.");
        setAccounts([]);
        return;
      }

      // Generate seed from mnemonic
      const seed = await bip39.mnemonicToSeed(seedPhraseStr);

      // Create HD wallet
      const node = ethers.HDNodeWallet.fromSeed(seed);
      // Ensure RPC URL has protocol
      const formattedRpcUrl = rpcUrl.startsWith("http")
        ? rpcUrl
        : `https://${rpcUrl}`;
      const provider = new ethers.JsonRpcProvider(formattedRpcUrl);
      const generatedAccounts: EthereumAccount[] = [];

      // Generate accounts using the standard derivation path for Ethereum
      for (let i = 0; i < 10; i++) {
        const path = `m/44'/60'/0'/0/${i}`;
        const wallet = node.derivePath(path);

        try {
          // Get balance
          const balance = await provider.getBalance(wallet.address);
          const formattedBalance = ethers.formatEther(balance);

          generatedAccounts.push({
            address: wallet.address,
            privateKey: wallet.privateKey,
            balance: `${Number(formattedBalance).toFixed(4)} ETH`,
          });
        } catch (balanceError) {
          console.error(
            `Error fetching balance for account ${i}:`,
            balanceError
          );
          // Continue with next account even if balance fetch fails
          generatedAccounts.push({
            address: wallet.address,
            privateKey: wallet.privateKey,
            balance: "Error fetching balance",
          });
        }
      }

      setAccounts(generatedAccounts);
      setError(null);
    } catch (err) {
      console.error("Error generating accounts:", err);
      setError(
        "Failed to generate accounts. Please check your seed phrase and try again."
      );
      setAccounts([]);
    } finally {
      setIsLoading(false);
    }
  }, [seedPhraseStr, rpcUrl]);

  // Use effect with proper dependency array
  useEffect(() => {
    // Only generate accounts if we have all 12 words filled
    if (seedPhrase.length === 12 && !seedPhrase.some((word) => !word)) {
      const timer = setTimeout(() => {
        generateAccounts();
      }, 500);

      return () => clearTimeout(timer);
    } else {
      setAccounts([]);
    }
  }, [seedPhraseStr]);

  const privateKeys = accounts.map((account) => account.privateKey);
  return { accounts, privateKeys, isLoading, error };
}

// Export the word list from bip39
export const wordList = bip39.wordlists.english;
