/**
 * Fix AnchorStateRegistry zero genesis anchor root
 *
 * The trh-sdk hardcodes FaultGameGenesisOutputRoot = 0x0 in input.go which causes
 * AnchorStateRegistry to be initialized with zero anchor roots. This prevents the
 * op-proposer from creating dispute games (FaultDisputeGame.initialize() rejects zero anchors).
 *
 * This script bootstraps the registry by:
 * 1. Deploying StorageSetter implementation to Sepolia
 * 2. Via SystemOwnerSafe → ProxyAdmin.upgradeAndCall:
 *    - Upgrade AnchorStateRegistry proxy to StorageSetter
 *    - Call setBytes32(anchors[0].root slot, genesis_output_root)
 * 3. Via SystemOwnerSafe → ProxyAdmin.upgrade:
 *    - Restore original AnchorStateRegistry implementation
 *
 * Usage:
 *   node scripts/fix-anchor-state-registry.mjs
 */

import { ethers } from 'ethers';

// ── Config ─────────────────────────────────────────────────────────────────
const L1_RPC   = 'https://eth-sepolia.g.alchemy.com/v2/zPJeUK2LKGg4LjvHPGXYl1Ef4FJ_u7Gn';
const L2_RPC   = 'http://localhost:8545';
const L1_CHAIN_ID = 11155111n;

const ADMIN_KEY = '0x679d88a9fb565707c0aff9434f9c141fee0b197455c12a52868b5d94bac694f9';

// Deployed contract addresses
const SYSTEM_OWNER_SAFE        = '0xA14E04782f1F707A1556Fb5C8737017BD20057Dd';
const PROXY_ADMIN              = '0xaEDc5c1E90DE5c41DF8A9A5AE6508F1B71EA7a36';
const ANCHOR_STATE_REGISTRY    = '0x1c00A086Ee22573ef86d41b12Bb1Dd3A8c83e9f4';
const ANCHOR_STATE_REGISTRY_IMPL = '0xd987136472d8b51b98384dccc17fe6cb9264d1c3'; // original impl

// Storage slot: anchors[0].root = keccak256(abi.encode(uint256(0), uint256(1)))
const ANCHORS_ROOT_SLOT = '0xa6eef7e35abe7026729641147f7915573c7e97b47efa546f5f6e3230263bcb49';

// StorageSetter bytecode from forge-artifacts (has setBytes32(bytes32,bytes32))
const STORAGE_SETTER_BYTECODE = '0x608060405234801561001057600080fd5b506103a9806100206000396000f3fe608060405234801561001057600080fd5b506004361061009e5760003560e01c8063a6ed563e11610066578063a6ed563e14610149578063abfdcced14610165578063bd02d0f514610149578063ca446dd914610173578063e2a4853a146100e857600080fd5b80630528afe2146100a357806321f8a721146100b85780634e91db08146100e857806354fd4d50146100fa5780637ae1cfca1461012b575b600080fd5b6100b66100b13660046101f4565b610181565b005b6100cb6100c6366004610269565b6101e4565b6040516001600160a01b0390911681526020015b60405180910390f35b6100b66100f6366004610282565b9055565b61011e604051806040016040528060058152602001640312e322e360dc1b81525081565b6040516100df91906102a4565b6101396100c6366004610269565b60405190151581526020016100df565b6101576100c6366004610269565b6040519081526020016100df565b6100b66100f63660046102f9565b6100b66100f636600461032e565b8060005b818110156101de576101cc8484838181106101a2576101a261035f565b905060400201600001358585848181106101be576101be61035f565b905060400201602001359055565b806101d681610375565b915050610185565b50505050565b60006101ee825490565b92915050565b6000806020838503121561020757600080fd5b823567ffffffffffffffff8082111561021f57600080fd5b818501915085601f83011261023357600080fd5b81358181111561024257600080fd5b8660208260061b850101111561025757600080fd5b60209290920196919550909350505050565b60006020828403121561027b57600080fd5b5035919050565b6000806040838503121561029557600080fd5b50508035926020909101359150565b600060208083528351808285015260005b818110156102d1578581018301518582016040015282016102b5565b818111156102e3576000604083870101525b50601f01601f1916929092016040019392505050565b6000806040838503121561030c57600080fd5b823591506020830135801515811461032357600080fd5b809150509250929050565b6000806040838503121561034157600080fd5b8235915060208301356001600160a01b038116811461032357600080fd5b634e487b7160e01b600052603260045260246000fd5b60006001820161039557634e487b7160e01b600052601160045260246000fd5b506001019056fea164736f6c634300080f000a';

// ── ABIs ───────────────────────────────────────────────────────────────────
const PROXY_ADMIN_ABI = [
  'function upgrade(address _proxy, address _implementation) external',
  'function upgradeAndCall(address _proxy, address _implementation, bytes calldata _data) external',
  'function owner() external view returns (address)',
];

const STORAGE_SETTER_ABI = [
  'function setBytes32(bytes32 _slot, bytes32 _value) external',
];

const SAFE_ABI = [
  'function nonce() external view returns (uint256)',
  'function getOwners() external view returns (address[])',
  'function getThreshold() external view returns (uint256)',
  'function execTransaction(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, bytes memory signatures) external payable returns (bool success)',
];

const OUTPUT_ROOT_ABI = [
  'function outputAtBlock(uint256 _l2BlockNumber) external view returns (tuple(bytes32 outputRoot, uint128 timestamp, uint128 l2BlockNumber) output)',
];

// ── Gnosis Safe EIP-712 Signing ────────────────────────────────────────────
const SAFE_TX_TYPEHASH = ethers.keccak256(ethers.toUtf8Bytes(
  'SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)'
));

const DOMAIN_SEPARATOR_TYPEHASH = ethers.keccak256(ethers.toUtf8Bytes(
  'EIP712Domain(uint256 chainId,address verifyingContract)'
));

function encodeSafeTxData(tx) {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ['bytes32', 'address', 'uint256', 'bytes32', 'uint8', 'uint256', 'uint256', 'uint256', 'address', 'address', 'uint256'],
    [
      SAFE_TX_TYPEHASH,
      tx.to,
      tx.value ?? 0n,
      ethers.keccak256(tx.data),
      tx.operation ?? 0,
      tx.safeTxGas ?? 0n,
      tx.baseGas ?? 0n,
      tx.gasPrice ?? 0n,
      tx.gasToken ?? ethers.ZeroAddress,
      tx.refundReceiver ?? ethers.ZeroAddress,
      tx.nonce,
    ]
  );
}

function domainSeparator(chainId, safeAddress) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'uint256', 'address'],
      [DOMAIN_SEPARATOR_TYPEHASH, chainId, safeAddress]
    )
  );
}

async function signSafeTx(wallet, safeAddress, chainId, tx) {
  const txData = encodeSafeTxData(tx);
  const txHash = ethers.keccak256(txData);
  const domain = domainSeparator(chainId, safeAddress);
  const msgHash = ethers.keccak256(
    ethers.concat(['0x1901', domain, txHash])
  );
  const sig = wallet.signingKey.sign(msgHash);
  // Gnosis Safe expects v to be 27 or 28 (not 0 or 1)
  const v = sig.v < 27 ? sig.v + 27 : sig.v;
  return ethers.concat([sig.r, sig.s, ethers.toBeHex(v, 1)]);
}

// ── Compute Genesis Output Root ────────────────────────────────────────────
async function computeGenesisOutputRoot() {
  const l2Provider = new ethers.JsonRpcProvider(L2_RPC);
  const block = await l2Provider.getBlock(0);
  if (!block) throw new Error('Could not get L2 genesis block');

  const stateRoot = block.stateRoot;
  const blockHash = block.hash;
  console.log('L2 genesis stateRoot:', stateRoot);
  console.log('L2 genesis blockHash:', blockHash);

  // Get L2ToL1MessagePasser storage root at block 0
  const L2_MESSAGE_PASSER = '0x4200000000000000000000000000000000000016';
  const proof = await l2Provider.send('eth_getProof', [L2_MESSAGE_PASSER, [], '0x0']);
  const messagePasserStorageRoot = proof.storageHash;
  console.log('L2 message passer storage root:', messagePasserStorageRoot);

  // outputRoot = keccak256(abi.encode(0, stateRoot, messagePasserStorageRoot, blockHash))
  const outputRoot = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'bytes32', 'bytes32', 'bytes32'],
      [0n, stateRoot, messagePasserStorageRoot, blockHash]
    )
  );
  console.log('Computed genesis output root:', outputRoot);
  return outputRoot;
}

// ── Execute Safe Transaction ────────────────────────────────────────────────
async function execSafeTx(wallet, safe, proxyAdmin, txData) {
  const nonce = await safe.nonce();
  console.log('Safe nonce:', nonce.toString());

  const safeTx = {
    to: PROXY_ADMIN,
    value: 0n,
    data: txData,
    operation: 0, // Call
    safeTxGas: 0n,
    baseGas: 0n,
    gasPrice: 0n,
    gasToken: ethers.ZeroAddress,
    refundReceiver: ethers.ZeroAddress,
    nonce: nonce,
  };

  const signatures = await signSafeTx(wallet, SYSTEM_OWNER_SAFE, L1_CHAIN_ID, safeTx);
  console.log('Signature:', signatures);

  const tx = await safe.execTransaction(
    safeTx.to,
    safeTx.value,
    safeTx.data,
    safeTx.operation,
    safeTx.safeTxGas,
    safeTx.baseGas,
    safeTx.gasPrice,
    safeTx.gasToken,
    safeTx.refundReceiver,
    signatures,
    { gasLimit: 500_000 }
  );
  console.log('Safe tx submitted:', tx.hash);
  const receipt = await tx.wait(1);
  console.log('Safe tx confirmed, status:', receipt.status);
  return receipt;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const l1Provider = new ethers.JsonRpcProvider(L1_RPC);
  const adminWallet = new ethers.Wallet(ADMIN_KEY, l1Provider);
  console.log('Admin address:', adminWallet.address);

  // Check L1 balance
  const balance = await l1Provider.getBalance(adminWallet.address);
  console.log('L1 balance:', ethers.formatEther(balance), 'ETH');
  if (balance < ethers.parseEther('0.01')) {
    throw new Error('Insufficient L1 balance for gas fees');
  }

  // Step 1: Compute genesis output root
  console.log('\n=== Step 1: Compute genesis output root ===');
  const genesisOutputRoot = await computeGenesisOutputRoot();

  // Step 2: Verify current anchor state is zero
  console.log('\n=== Step 2: Verify current anchor state ===');
  const currentRoot = await l1Provider.getStorage(ANCHOR_STATE_REGISTRY, ANCHORS_ROOT_SLOT);
  console.log('Current anchors[0].root:', currentRoot);
  if (currentRoot !== '0x' + '0'.repeat(64)) {
    console.log('Anchor root is already non-zero — skipping bootstrap');
    return;
  }

  // Step 3: Deploy StorageSetter
  console.log('\n=== Step 3: Deploy StorageSetter ===');
  const deployTx = await adminWallet.sendTransaction({
    data: STORAGE_SETTER_BYTECODE,
    gasLimit: 500_000,
  });
  console.log('Deploy tx:', deployTx.hash);
  const deployReceipt = await deployTx.wait(1);
  const storageSetterAddr = deployReceipt.contractAddress;
  console.log('StorageSetter deployed at:', storageSetterAddr);

  // Step 4: Encode upgradeAndCall data
  console.log('\n=== Step 4: Execute upgradeAndCall via Safe ===');
  const proxyAdminIface = new ethers.Interface(PROXY_ADMIN_ABI);
  const storageSetterIface = new ethers.Interface(STORAGE_SETTER_ABI);

  const setRootCalldata = storageSetterIface.encodeFunctionData('setBytes32', [
    ANCHORS_ROOT_SLOT,
    genesisOutputRoot,
  ]);
  console.log('setBytes32 calldata:', setRootCalldata);

  const upgradeAndCallData = proxyAdminIface.encodeFunctionData('upgradeAndCall', [
    ANCHOR_STATE_REGISTRY,
    storageSetterAddr,
    setRootCalldata,
  ]);
  console.log('upgradeAndCall data length:', upgradeAndCallData.length);

  const safe = new ethers.Contract(SYSTEM_OWNER_SAFE, SAFE_ABI, adminWallet);
  const proxyAdmin = new ethers.Contract(PROXY_ADMIN, PROXY_ADMIN_ABI, adminWallet);

  await execSafeTx(adminWallet, safe, proxyAdmin, upgradeAndCallData);

  // Step 5: Verify root was set
  console.log('\n=== Step 5: Verify anchor root was set ===');
  const newRoot = await l1Provider.getStorage(ANCHOR_STATE_REGISTRY, ANCHORS_ROOT_SLOT);
  console.log('New anchors[0].root:', newRoot);

  if (newRoot.toLowerCase() !== genesisOutputRoot.toLowerCase()) {
    throw new Error(`Root not set correctly. Expected: ${genesisOutputRoot}, Got: ${newRoot}`);
  }

  // Step 6: Restore original implementation
  console.log('\n=== Step 6: Restore original AnchorStateRegistry implementation ===');
  const upgradeData = proxyAdminIface.encodeFunctionData('upgrade', [
    ANCHOR_STATE_REGISTRY,
    ANCHOR_STATE_REGISTRY_IMPL,
  ]);

  await execSafeTx(adminWallet, safe, proxyAdmin, upgradeData);

  // Step 7: Verify implementation restored
  console.log('\n=== Step 7: Verify implementation restored ===');
  const EIP1967_IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
  const implSlot = await l1Provider.getStorage(ANCHOR_STATE_REGISTRY, EIP1967_IMPL_SLOT);
  const restoredImpl = '0x' + implSlot.slice(-40);
  console.log('Restored implementation:', restoredImpl);
  console.log('Expected implementation:', ANCHOR_STATE_REGISTRY_IMPL);

  // Final verification
  const finalRoot = await l1Provider.getStorage(ANCHOR_STATE_REGISTRY, ANCHORS_ROOT_SLOT);
  console.log('\n=== FINAL STATE ===');
  console.log('anchors[0].root:', finalRoot);
  console.log('Expected:', genesisOutputRoot);
  console.log('Match:', finalRoot.toLowerCase() === genesisOutputRoot.toLowerCase());

  if (finalRoot.toLowerCase() === genesisOutputRoot.toLowerCase()) {
    console.log('\n✅ AnchorStateRegistry bootstrapped successfully!');
    console.log('The op-proposer should now be able to create dispute games.');
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
