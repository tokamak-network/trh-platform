/**
 * Bootstrap AnchorStateRegistry for stack 05cb45ea
 *
 * StorageSetter at 0x7213A04B7bC618BA9688385D0792ACA3CA2356e4 is verified correct
 * (PUSH2 0x0282 which IS a JUMPDEST — confirmed on Sepolia).
 *
 * Genesis output root taken from deploy-local-infra log:
 *   {"msg":"Genesis output root: 0x69f208e4c1bb9f00bc6493b7e5ea94903c16f1209aa9bff66c01da5c6883f365"}
 */

import { ethers } from 'ethers';

const L1_RPC  = 'https://ethereum-sepolia-rpc.publicnode.com';
const ADMIN_KEY = '0x6544462e611a9040a74d0fdfe3f00ed4b3c3e924a6f29165059c76e6e587e4ff';

const PROXY_ADMIN                = '0x25A88004561186940B3299a9f9dC795B4a6497b4';
const ANCHOR_STATE_REGISTRY      = '0x0Ec27AD556f6dD7b4Bb89e9fe9F975A5d194365B';
const ANCHOR_STATE_REGISTRY_IMPL = '0x60cb2b7a28602c8bf912ed9014b55ad15f30707a';
const STORAGE_SETTER_ADDR        = '0x7213A04B7bC618BA9688385D0792ACA3CA2356e4';

const ANCHORS_ROOT_SLOT   = '0xa6eef7e35abe7026729641147f7915573c7e97b47efa546f5f6e3230263bcb49';
const GENESIS_OUTPUT_ROOT = '0x69f208e4c1bb9f00bc6493b7e5ea94903c16f1209aa9bff66c01da5c6883f365';
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

  const currentRoot = await l1Provider.getStorage(ANCHOR_STATE_REGISTRY, ANCHORS_ROOT_SLOT);
  console.log('Current anchors[0].root:', currentRoot);
  if (currentRoot !== '0x' + '0'.repeat(64)) {
    console.log('Anchor root already set — nothing to do');
    return;
  }

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
    { gasLimit: 300_000 },
  );
  console.log('upgradeAndCall tx:', tx1.hash);
  const receipt1 = await tx1.wait(1);
  console.log('status:', receipt1.status);
  if (receipt1.status !== 1) throw new Error('upgradeAndCall reverted');

  const newRoot = await l1Provider.getStorage(ANCHOR_STATE_REGISTRY, ANCHORS_ROOT_SLOT);
  console.log('New anchors[0].root:', newRoot);
  if (newRoot.toLowerCase() !== GENESIS_OUTPUT_ROOT.toLowerCase()) {
    throw new Error(`Root mismatch. Expected: ${GENESIS_OUTPUT_ROOT}, Got: ${newRoot}`);
  }
  console.log('Root set ✓');

  console.log('\n=== Restore original impl ===');
  const tx2 = await proxyAdmin.upgrade(
    ANCHOR_STATE_REGISTRY,
    ANCHOR_STATE_REGISTRY_IMPL,
    { gasLimit: 100_000 },
  );
  console.log('upgrade tx:', tx2.hash);
  await tx2.wait(1);

  const implSlot = await l1Provider.getStorage(ANCHOR_STATE_REGISTRY, EIP1967_IMPL_SLOT);
  const restoredImpl = '0x' + implSlot.slice(-40);
  console.log('Restored impl:', restoredImpl);

  const finalRoot = await l1Provider.getStorage(ANCHOR_STATE_REGISTRY, ANCHORS_ROOT_SLOT);
  console.log('Final root:', finalRoot);

  if (finalRoot.toLowerCase() === GENESIS_OUTPUT_ROOT.toLowerCase()) {
    console.log('\nAnchorStateRegistry bootstrapped successfully for stack 05cb45ea!');
  } else {
    throw new Error(`Final root mismatch: ${finalRoot}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
