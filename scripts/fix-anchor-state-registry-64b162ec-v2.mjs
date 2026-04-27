/**
 * Fix AnchorStateRegistry for stack 64b162ec — v2 (correct StorageSetter)
 *
 * The STORAGE_SETTER_BYTECODE used here is the ORIGINAL correct bytecode from the
 * fix scripts. In this bytecode, offset 0x0282 IS a JUMPDEST, so setBytes32 works.
 * (Previous attempt used wrong bytecode with 0x0274 target which is not a JUMPDEST.)
 *
 * Correct StorageSetter deployed at 0x7213A04B7bC618BA9688385D0792ACA3CA2356e4
 * — verified: cast call returns 0x (success) for setBytes32.
 */

import { ethers } from 'ethers';

const L1_RPC = 'https://eth-sepolia.g.alchemy.com/v2/zPJeUK2LKGg4LjvHPGXYl1Ef4FJ_u7Gn';
const ADMIN_KEY = '0x6544462e611a9040a74d0fdfe3f00ed4b3c3e924a6f29165059c76e6e587e4ff';

const PROXY_ADMIN                = '0x7a64945a61ee458726eeb8645d1525681035184e';
const ANCHOR_STATE_REGISTRY      = '0xbee87d496c1e2aD42154E36587b82627a7532A8F';
const ANCHOR_STATE_REGISTRY_IMPL = '0xBf9f8F20bCBE792E32315Ab3e92c83FfD41F9c01';
const STORAGE_SETTER_ADDR        = '0x7213A04B7bC618BA9688385D0792ACA3CA2356e4';

const ANCHORS_ROOT_SLOT   = '0xa6eef7e35abe7026729641147f7915573c7e97b47efa546f5f6e3230263bcb49';
const GENESIS_OUTPUT_ROOT = '0x059d651332d564ad5790bccd48ad7b6b630ad6fb56679b0b54332fe1282eaede';
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

  // Check current anchor root
  const currentRoot = await l1Provider.getStorage(ANCHOR_STATE_REGISTRY, ANCHORS_ROOT_SLOT);
  console.log('Current anchors[0].root:', currentRoot);
  if (currentRoot !== '0x' + '0'.repeat(64)) {
    console.log('Anchor root is already non-zero — skipping bootstrap');
    return;
  }

  // Step 4: upgradeAndCall
  console.log('\n=== upgradeAndCall (write anchor root) ===');
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

  // Verify root was set
  const newRoot = await l1Provider.getStorage(ANCHOR_STATE_REGISTRY, ANCHORS_ROOT_SLOT);
  console.log('New anchors[0].root:', newRoot);
  if (newRoot.toLowerCase() !== GENESIS_OUTPUT_ROOT.toLowerCase()) {
    throw new Error(`Root not set correctly. Expected: ${GENESIS_OUTPUT_ROOT}, Got: ${newRoot}`);
  }
  console.log('Root set correctly ✓');

  // Restore original implementation
  console.log('\n=== Restore original implementation ===');
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
    console.log('\nAnchorStateRegistry bootstrapped successfully!');
  } else {
    throw new Error(`Final root mismatch. Expected: ${GENESIS_OUTPUT_ROOT}, Got: ${finalRoot}`);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
