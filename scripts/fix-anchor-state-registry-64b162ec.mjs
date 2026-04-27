/**
 * Fix AnchorStateRegistry for deployment 64b162ec
 *
 * Problem: trh-backend deploy-local-infra step calls ProxyAdmin.upgradeAndCall
 * with a StorageSetter contract that has a buggy JUMP target in its setBytes32
 * function body. The function body at offset 0xe8 does PUSH2 0x0282, but offset
 * 0x0282 is a JUMPI opcode (0x57), not JUMPDEST (0x5b), causing InvalidJump
 * and an immediate revert with only 187 gas consumed.
 *
 * Fix: Correct the STORAGE_SETTER_BYTECODE — change PUSH2 0x0282 → PUSH2 0x0274.
 * In the hex string: replace `6100b66100f6366004610282` with `6100b66100f6366004610274`.
 *
 * Stack: 64b162ec-f668-42e7-b26f-ea71ac80d773 (Gaming preset, ETH fee token)
 * ProxyAdmin owner: EOA (direct calls, no Gnosis Safe)
 *
 * Usage:
 *   node scripts/fix-anchor-state-registry-64b162ec.mjs
 */

import { ethers } from 'ethers';

// ── Config ─────────────────────────────────────────────────────────────────
const L1_RPC      = 'https://eth-sepolia.g.alchemy.com/v2/zPJeUK2LKGg4LjvHPGXYl1Ef4FJ_u7Gn';
const L1_CHAIN_ID = 11155111n;

// ProxyAdmin owner EOA
const ADMIN_KEY = '0x6544462e611a9040a74d0fdfe3f00ed4b3c3e924a6f29165059c76e6e587e4ff';

// 64b162ec deployment addresses
const PROXY_ADMIN                = '0x7a64945a61ee458726eeb8645d1525681035184e';
const ANCHOR_STATE_REGISTRY      = '0xbee87d496c1e2aD42154E36587b82627a7532A8F';
const ANCHOR_STATE_REGISTRY_IMPL = '0xBf9f8F20bCBE792E32315Ab3e92c83FfD41F9c01';

// Storage slot: anchors[0].root = keccak256(abi.encode(uint256(0), uint256(1)))
const ANCHORS_ROOT_SLOT = '0xa6eef7e35abe7026729641147f7915573c7e97b47efa546f5f6e3230263bcb49';

// Genesis output root (pre-computed from L2 genesis block)
const GENESIS_OUTPUT_ROOT = '0x059d651332d564ad5790bccd48ad7b6b630ad6fb56679b0b54332fe1282eaede';

// StorageSetter bytecode — FIXED: PUSH2 0x0282 → PUSH2 0x0274 in setBytes32 body
// Original buggy pattern:   6100b66100f6366004610282
// Corrected pattern:        6100b66100f6366004610274
const STORAGE_SETTER_BYTECODE = '0x608060405234801561001057600080fd5b506103a9806100206000396000f3fe608060405234801561001057600080fd5b506004361061009e5760003560e01c8063a6ed563e11610066578063a6ed563e14610149578063abfdcced14610165578063bd02d0f514610149578063ca446dd914610173578063e2a4853a146100e857600080fd5b80630528afe2146100a357806321f8a721146100b85780634e91db08146100e857806354fd4d50146100fa5780637ae1cfca1461012b575b600080fd5b6100b66100b13660046101f4565b610181565b005b6100cb6100c6366004610269565b6101e4565b6040516001600160a01b0390911681526020015b60405180910390f35b6100b66100f6366004610274565b9055565b61011e604051806040016040528060058152602001640312e322e360dc1b81525081565b6040516100df91906102a4565b6101396100c6366004610269565b60405190151581526020016100df565b6101576100c6366004610269565b6040519081526020016100df565b6100b66100f63660046102f9565b6100b66100f636600461032e565b8060005b818110156101de576101cc8484838181106101a2576101a261035f565b905060400201600001358585848181106101be576101be61035f565b905060400201602001359055565b806101d681610375565b915050610185565b50505050565b60006101ee825490565b92915050565b6000806020838503121561020757600080fd5b823567ffffffffffffffff8082111561021f57600080fd5b818501915085601f83011261023357600080fd5b81358181111561024257600080fd5b8660208260061b850101111561025757600080fd5b60209290920196919550909350505050565b60006020828403121561027b57600080fd5b5035919050565b6000806040838503121561029557600080fd5b50508035926020909101359150565b600060208083528351808285015260005b818110156102d1578581018301518582016040015282016102b5565b818111156102e3576000604083870101525b50601f01601f1916929092016040019392505050565b6000806040838503121561030c57600080fd5b823591506020830135801515811461032357600080fd5b809150509250929050565b6000806040838503121561034157600080fd5b8235915060208301356001600160a01b038116811461032357600080fd5b634e487b7160e01b600052603260045260246000fd5b60006001820161039557634e487b7160e01b600052601160045260246000fd5b506001019056fea164736f6c634300080f000a';

// ── ABIs ───────────────────────────────────────────────────────────────────
const PROXY_ADMIN_ABI = [
  'function upgrade(address _proxy, address _implementation) external',
  'function upgradeAndCall(address _proxy, address _implementation, bytes calldata _data) external',
  'function owner() external view returns (address)',
];

const STORAGE_SETTER_ABI = [
  'function setBytes32(bytes32 _slot, bytes32 _value) external',
];

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const l1Provider = new ethers.JsonRpcProvider(L1_RPC);
  const adminWallet = new ethers.Wallet(ADMIN_KEY, l1Provider);
  console.log('Admin address:', adminWallet.address);

  const balance = await l1Provider.getBalance(adminWallet.address);
  console.log('L1 balance:', ethers.formatEther(balance), 'ETH');
  if (balance < ethers.parseEther('0.01')) {
    throw new Error('Insufficient L1 balance for gas fees');
  }

  const proxyAdmin = new ethers.Contract(PROXY_ADMIN, PROXY_ADMIN_ABI, adminWallet);

  const owner = await proxyAdmin.owner();
  console.log('ProxyAdmin owner:', owner);
  if (owner.toLowerCase() !== adminWallet.address.toLowerCase()) {
    throw new Error(`Admin wallet ${adminWallet.address} does not own ProxyAdmin (owner: ${owner})`);
  }

  // Step 1: Check current anchor root
  console.log('\n=== Step 1: Check current anchor state ===');
  const currentRoot = await l1Provider.getStorage(ANCHOR_STATE_REGISTRY, ANCHORS_ROOT_SLOT);
  console.log('Current anchors[0].root:', currentRoot);
  if (currentRoot !== '0x' + '0'.repeat(64)) {
    console.log('Anchor root is already non-zero — skipping bootstrap');
    return;
  }

  // Step 2: Use pre-computed genesis output root
  console.log('\n=== Step 2: Genesis output root ===');
  console.log('Using pre-computed genesis output root:', GENESIS_OUTPUT_ROOT);

  // Step 3: Deploy fixed StorageSetter
  console.log('\n=== Step 3: Deploy fixed StorageSetter ===');
  const deployTx = await adminWallet.sendTransaction({
    data: STORAGE_SETTER_BYTECODE,
    gasLimit: 500_000,
  });
  console.log('Deploy tx:', deployTx.hash);
  const deployReceipt = await deployTx.wait(1);
  const storageSetterAddr = deployReceipt.contractAddress;
  console.log('StorageSetter deployed at:', storageSetterAddr);

  // Step 4: upgradeAndCall — upgrade proxy to StorageSetter + write anchor root
  console.log('\n=== Step 4: upgradeAndCall (write anchor root) ===');
  const storageSetterIface = new ethers.Interface(STORAGE_SETTER_ABI);
  const setRootCalldata = storageSetterIface.encodeFunctionData('setBytes32', [
    ANCHORS_ROOT_SLOT,
    GENESIS_OUTPUT_ROOT,
  ]);

  const tx1 = await proxyAdmin.upgradeAndCall(
    ANCHOR_STATE_REGISTRY,
    storageSetterAddr,
    setRootCalldata,
    { gasLimit: 300_000 }
  );
  console.log('upgradeAndCall tx:', tx1.hash);
  const receipt1 = await tx1.wait(1);
  console.log('upgradeAndCall confirmed, status:', receipt1.status);

  // Step 5: Verify root was set
  console.log('\n=== Step 5: Verify anchor root ===');
  const newRoot = await l1Provider.getStorage(ANCHOR_STATE_REGISTRY, ANCHORS_ROOT_SLOT);
  console.log('New anchors[0].root:', newRoot);
  if (newRoot.toLowerCase() !== GENESIS_OUTPUT_ROOT.toLowerCase()) {
    throw new Error(`Root not set correctly. Expected: ${GENESIS_OUTPUT_ROOT}, Got: ${newRoot}`);
  }

  // Step 6: Restore original AnchorStateRegistry implementation
  console.log('\n=== Step 6: Restore original implementation ===');
  const tx2 = await proxyAdmin.upgrade(
    ANCHOR_STATE_REGISTRY,
    ANCHOR_STATE_REGISTRY_IMPL,
    { gasLimit: 100_000 }
  );
  console.log('upgrade tx:', tx2.hash);
  const receipt2 = await tx2.wait(1);
  console.log('upgrade confirmed, status:', receipt2.status);

  // Step 7: Final verification
  console.log('\n=== Step 7: Final verification ===');
  const EIP1967_IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
  const implSlot = await l1Provider.getStorage(ANCHOR_STATE_REGISTRY, EIP1967_IMPL_SLOT);
  const restoredImpl = '0x' + implSlot.slice(-40);
  console.log('Restored implementation:', restoredImpl);

  const finalRoot = await l1Provider.getStorage(ANCHOR_STATE_REGISTRY, ANCHORS_ROOT_SLOT);
  console.log('Final anchors[0].root:', finalRoot);

  if (finalRoot.toLowerCase() === GENESIS_OUTPUT_ROOT.toLowerCase()) {
    console.log('\nAnchorStateRegistry bootstrapped successfully!');
    console.log('Stack 64b162ec is ready — retry deployment from the backend or Electron app.');
  } else {
    throw new Error(`Final root mismatch. Expected: ${GENESIS_OUTPUT_ROOT}, Got: ${finalRoot}`);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
