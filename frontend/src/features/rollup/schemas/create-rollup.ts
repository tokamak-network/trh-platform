import { z } from "zod";

// Network & Chain Schema
export const networkAndChainSchema = z
  .object({
    network: z.string().min(1, "Network is required"),
    chainName: z
      .string()
      .min(1, "Chain name is required")
      .max(15, "Chain name must be less than 15 characters")
      .regex(
        /^[a-zA-Z][a-zA-Z0-9\s]*$/,
        "Must start with a letter and can only contain letters, numbers and spaces"
      ),
    l1RpcUrl: z
      .string()
      .min(1, "L1 RPC URL is required")
      .url("Must be a valid URL"),
    l1BeaconUrl: z
      .string()
      .min(1, "L1 Beacon URL is required")
      .url("Must be a valid URL"),
    advancedConfig: z.boolean(),
    l2BlockTime: z.string().optional(),
    batchSubmissionFreq: z.string().optional(),
    outputRootFreq: z.string().optional(),
    challengePeriod: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.outputRootFreq && data.l2BlockTime) {
        const outputRootFreq = Number(data.outputRootFreq);
        const l2BlockTime = Number(data.l2BlockTime);
        if (isNaN(outputRootFreq) || isNaN(l2BlockTime)) return false;
        if (outputRootFreq <= 0 || l2BlockTime <= 0) return false;
        if (!Number.isInteger(outputRootFreq) || !Number.isInteger(l2BlockTime))
          return false;
        return outputRootFreq % l2BlockTime === 0;
      }
      return true;
    },
    {
      message: "Output Root Frequency must be a multiple of L2 Block Time",
      path: ["outputRootFreq"],
    }
  )
  .refine(
    (data) => {
      if (data.l2BlockTime) {
        const num = Number(data.l2BlockTime);
        if (isNaN(num)) return false;
        if (num <= 0) return false;
        if (!Number.isInteger(num)) return false;
        return true;
      }
      return true;
    },
    {
      message: "L2 Block Time must be a positive integer",
      path: ["l2BlockTime"],
    }
  )
  .refine(
    (data) => {
      if (data.batchSubmissionFreq) {
        const num = Number(data.batchSubmissionFreq);
        if (isNaN(num)) return false;
        if (num <= 0) return false;
        if (!Number.isInteger(num)) return false;
        if (num % 12 !== 0) return false;
        return true;
      }
      return true;
    },
    {
      message:
        "Batch Submission Frequency must be a positive integer and a multiple of 12",
      path: ["batchSubmissionFreq"],
    }
  )
  .refine(
    (data) => {
      if (data.outputRootFreq) {
        const num = Number(data.outputRootFreq);
        if (isNaN(num)) return false;
        if (num <= 0) return false;
        if (!Number.isInteger(num)) return false;
        return true;
      }
      return true;
    },
    {
      message: "Output Root Frequency must be a positive integer",
      path: ["outputRootFreq"],
    }
  )
  .refine(
    (data) => {
      if (data.challengePeriod) {
        const num = Number(data.challengePeriod);
        if (isNaN(num)) return false;
        if (num <= 0) return false;
        if (!Number.isInteger(num)) return false;
        return true;
      }
      return true;
    },
    {
      message: "Challenge Period must be a positive integer",
      path: ["challengePeriod"],
    }
  );

// Account & AWS Setup Schema
export const accountAndAwsSchema = z.object({
  seedPhrase: z
    .array(z.string())
    .length(12, "Seed phrase must contain exactly 12 words"),
  adminAccount: z.string().min(1, "Admin account is required"),
  adminPrivateKey: z.string().min(1, "Admin private key is required"),
  proposerAccount: z.string().min(1, "Proposer account is required"),
  proposerPrivateKey: z.string().min(1, "Proposer private key is required"),
  batchAccount: z.string().min(1, "Batch account is required"),
  batchPrivateKey: z.string().min(1, "Batch private key is required"),
  sequencerAccount: z.string().min(1, "Sequencer account is required"),
  sequencerPrivateKey: z.string().min(1, "Sequencer private key is required"),
  accountName: z.string().min(1, "Account name is required"),
  credentialId: z.string().min(1, "AWS credential is required"),
  awsAccessKey: z.string(),
  awsSecretKey: z.string(),
  awsRegion: z.string().min(1, "AWS region is required"),
});

// DAO Candidate Schema
export const daoCandidateSchema = z
  .object({
    amount: z
      .string()
      .min(1, "Amount is required")
      .refine(
        (val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 1000.1,
        "Amount must be at least 1000.1 TON"
      ),
    memo: z.string().min(1, "Memo is required"),
    nameInfo: z.string().optional(),
  })
  .optional();

// Combined schema for the entire form
export const createRollupSchema = z.object({
  networkAndChain: networkAndChainSchema,
  accountAndAws: accountAndAwsSchema,
  daoCandidate: daoCandidateSchema,
});

export type CreateRollupFormData = z.infer<typeof createRollupSchema>;

// Backend request schema
export const rollupDeploymentSchema = z.object({
  network: z.string(),
  l1RpcUrl: z.string().url(),
  l1BeaconUrl: z.string().url(),
  l2BlockTime: z.number().int().positive(),
  batchSubmissionFrequency: z.number().int().positive(),
  outputRootFrequency: z.number().int().positive(),
  challengePeriod: z.number().int().positive(),
  adminAccount: z.string(),
  sequencerAccount: z.string(),
  batcherAccount: z.string(),
  proposerAccount: z.string(),
  awsAccessKey: z.string(),
  awsSecretAccessKey: z.string(),
  awsRegion: z.string(),
  chainName: z.string(),
  registerCandidate: z.boolean(),
  registerCandidateParams: z
    .object({
      amount: z.number().min(1000.1),
      memo: z.string(),
      nameInfo: z.string().optional(),
    })
    .optional(),
});

export type RollupDeploymentRequest = z.infer<typeof rollupDeploymentSchema>;

/**
 * Converts form data to the backend deployment request format
 */
export const convertFormToDeploymentRequest = (
  formData: CreateRollupFormData
): RollupDeploymentRequest => {
  const { networkAndChain, accountAndAws, daoCandidate } = formData;

  const request: RollupDeploymentRequest = {
    network: networkAndChain.network,
    l1RpcUrl: networkAndChain.l1RpcUrl,
    l1BeaconUrl: networkAndChain.l1BeaconUrl,
    l2BlockTime: networkAndChain.l2BlockTime
      ? parseInt(networkAndChain.l2BlockTime)
      : 6,
    batchSubmissionFrequency: networkAndChain.batchSubmissionFreq
      ? parseInt(networkAndChain.batchSubmissionFreq)
      : 1440,
    outputRootFrequency: networkAndChain.outputRootFreq
      ? parseInt(networkAndChain.outputRootFreq)
      : 240,
    challengePeriod: networkAndChain.challengePeriod
      ? parseInt(networkAndChain.challengePeriod)
      : 12,
    adminAccount: accountAndAws.adminPrivateKey.trim().replace("0x", ""),
    sequencerAccount: accountAndAws.sequencerPrivateKey
      .trim()
      .replace("0x", ""),
    batcherAccount: accountAndAws.batchPrivateKey.trim().replace("0x", ""),
    proposerAccount: accountAndAws.proposerPrivateKey.trim().replace("0x", ""),
    awsAccessKey: accountAndAws.awsAccessKey,
    awsSecretAccessKey: accountAndAws.awsSecretKey,
    awsRegion: accountAndAws.awsRegion,
    chainName: networkAndChain.chainName,
    registerCandidate: !!daoCandidate,
    registerCandidateParams: daoCandidate
      ? {
          amount: parseFloat(daoCandidate.amount),
          memo: daoCandidate.memo,
          nameInfo: daoCandidate.nameInfo,
        }
      : undefined,
  };

  return request;
};
