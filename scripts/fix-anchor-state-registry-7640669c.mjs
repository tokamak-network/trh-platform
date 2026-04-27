/**
 * Fix AnchorStateRegistry for stack 7640669c
 *
 * Root cause: storageSetterBytecode in deploy_chain.go was 14 bytes short (diverged at byte 401),
 * causing all JUMP targets to be wrong → InvalidJump on setBytes32 call.
 *
 * This script reuses the correctly deployed StorageSetter at 0x7213A04B7bC618BA9688385D0792ACA3CA2356e4
 * (937-byte runtime, all JUMP targets valid) to write the genesis anchor root directly.
 *
 * Stack info:
 *   ProxyAdmin:              0x5e0b2a1d2641de2A3eC54981E29A981f56a8b56C
 *   AnchorStateRegistryProxy: 0xD5661A1c61B4b855232A80145FD8f30Df76C8343
 *   AnchorStateRegistryImpl:  0xd1e9798538801398a0b7e5748ae5e1bb11a82349 (from EIP-1967 slot)
 *   GenesisOutputRoot:        0x1351f68637228d3c625f0935fb767c5f3e1f08f4f266d78c24e712a12acf7f68
 *     (keccak256(bytes32(0) || stateRoot 0xe7079... || emptyMPT 0x56e81... || blockHash 0x9667...))
 */

import { ethers } from 'ethers';

const L1_RPC    = 'https://sepolia.drpc.org';
const ADMIN_KEY = '0x6544462e611a9040a74d0fdfe3f00ed4b3c3e924a6f29165059c76e6e587e4ff';

const PROXY_ADMIN                = '0x5e0b2a1d2641de2A3eC54981E29A981f56a8b56C';
const ANCHOR_STATE_REGISTRY      = '0xD5661A1c61B4b855232A80145FD8f30Df76C8343';
const ANCHOR_STATE_REGISTRY_IMPL = '0xd1e9798538801398a0b7e5748ae5e1bb11a82349';
const STORAGE_SETTER_ADDR        = '0x7213A04B7bC618BA9688385D0792ACA3CA2356e4';

const ANCHORS_ROOT_SLOT   = '0xa6eef7e35abe7026729641147f7915573c7e97b47efa546f5f6e3230263bcb49';
const GENESIS_OUTPUT_ROOT = '0x1351f68637228d3c625f0935fb767c5f3e1f08f4f266d78c24e712a12acf7f68';
const EIP1967_IMPL_SLOT   = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

const PROXY_ADMIN_ABI = [
  'function upgrade(address _proxy, address _implementation) external',
  'function upgradeAndCall(address _proxy, address _implementation, bytes calldata _data) external',
];
const STORAGE_SETTER_ABI = ['function setBytes32(bytes32 _slot, bytes32 _value) external'];

async function main() {
  const l1Provider = new ethers.JsonRpcProvider(L1_RPC);
  const adminWallet = new ethers.Wallet(ADMIN_KEY, l1Provider);
  console.log('Admin address:', adminWallet.address);

  const proxyAdmin = new ethers.Contract(PROXY_ADMIN, PROXY_ADMIN_ABI, adminWallet);

  // Idempotency check
  const currentRoot = await l1Provider.getStorage(ANCHOR_STATE_REGISTRY, ANCHORS_ROOT_SLOT);
  console.log('Current anchors[0].root:', currentRoot);
  if (currentRoot !== '0x' + '0'.repeat(64)) {
    console.log('Anchor root already non-zero — skipping bootstrap');
    return;
  }

  // upgradeAndCall: upgrade proxy to StorageSetter and call setBytes32
  console.log('\n=== Step 1: upgradeAndCall (write anchor root) ===');
  const storageSetterIface = new ethers.Interface(STORAGE_SETTER_ABI);
  const setRootCalldata = storageSetterIface.encodeFunctionData('setBytes32', [
    ANCHORS_ROOT_SLOT,
    GENESIS_OUTPUT_ROOT,
  ]);

  const tx1 = await proxyAdmin.upgradeAndCall(
    ANCHOR_STATE_REGISTRY,
    STORAGE_SETTER_ADDR,
    setRootCalldata,
    { gasLimit: 300_000 }
  );
  console.log('upgradeAndCall tx:', tx1.hash);
  const receipt1 = await tx1.wait(1);
  console.log('upgradeAndCall confirmed, status:', receipt1.status);
  if (receipt1.status !== 1) throw new Error('upgradeAndCall reverted');

  // Verify root was written
  const newRoot = await l1Provider.getStorage(ANCHOR_STATE_REGISTRY, ANCHORS_ROOT_SLOT);
  console.log('New anchors[0].root:', newRoot);
  if (newRoot.toLowerCase() !== GENESIS_OUTPUT_ROOT.toLowerCase()) {
    throw new Error(`Root not set correctly. Expected: ${GENESIS_OUTPUT_ROOT}, Got: ${newRoot}`);
  }
  console.log('Root set correctly ✓');

  // Restore original implementation
  console.log('\n=== Step 2: Restore original implementation ===');
  const tx2 = await proxyAdmin.upgrade(
    ANCHOR_STATE_REGISTRY,
    ANCHOR_STATE_REGISTRY_IMPL,
    { gasLimit: 100_000 }
  );
  console.log('upgrade tx:', tx2.hash);
  const receipt2 = await tx2.wait(1);
  console.log('upgrade confirmed, status:', receipt2.status);

  // Final verification
  const implSlot = await l1Provider.getStorage(ANCHOR_STATE_REGISTRY, EIP1967_IMPL_SLOT);
  const restoredImpl = '0x' + implSlot.slice(-40);
  console.log('Restored implementation:', restoredImpl);

  const finalRoot = await l1Provider.getStorage(ANCHOR_STATE_REGISTRY, ANCHORS_ROOT_SLOT);
  console.log('Final anchors[0].root:', finalRoot);

  if (finalRoot.toLowerCase() === GENESIS_OUTPUT_ROOT.toLowerCase()) {
    console.log('\nAnchorStateRegistry bootstrapped successfully! ✓');
    console.log('op-proposer should unblock within ~2 min as L2 safe head advances.');
  } else {
    throw new Error(`Final root mismatch. Expected: ${GENESIS_OUTPUT_ROOT}, Got: ${finalRoot}`);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
