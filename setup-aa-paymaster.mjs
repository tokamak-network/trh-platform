/**
 * Setup AA paymaster for WUSDC:
 * 1. Update SimplePriceOracle price to 1.5e18
 * 2. Register WUSDC with MultiTokenPaymaster
 */
import { ethers } from 'ethers';

const L2_RPC = 'http://localhost:8545';
const ADMIN_KEY = '0x679d88a9fb565707c0aff9434f9c141fee0b197455c12a52868b5d94bac694f9';
const ORACLE = '0x4200000000000000000000000000000000000066';
const PAYMASTER = '0x4200000000000000000000000000000000000067';
const WUSDC = '0x4200000000000000000000000000000000000006';
const MARKUP_PCT = 3n;
const DECIMALS = 18;
const INITIAL_PRICE = 1500000000000000000n; // 1.5e18

function encodeCall(sig, ...args) {
  const iface = new ethers.Interface([`function ${sig}`]);
  return iface.encodeFunctionData(sig.split('(')[0], args);
}

async function getGasPrice(provider) {
  const block = await provider.getBlock('latest');
  const baseFee = block?.baseFeePerGas ?? 1000n;
  return baseFee + baseFee / 100n + 1n;
}

async function sendTx(wallet, provider, txParams, label) {
  const gasPrice = await getGasPrice(provider);
  const preNonce = await provider.getTransactionCount(wallet.address, 'latest');

  let gasLimit = txParams.gasLimit;
  if (!gasLimit) {
    try {
      const est = await provider.estimateGas({ from: wallet.address, ...txParams });
      gasLimit = est * 11n / 10n;
    } catch(e) {
      gasLimit = 200000n;
      console.log(`  Gas estimate failed for ${label}: ${e.message.slice(0,50)}`);
    }
  }

  const tx = await wallet.sendTransaction({ ...txParams, type: 0, gasPrice, gasLimit });
  console.log(`  Sent: ${tx.hash.slice(0,14)}...`);

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const newNonce = await provider.getTransactionCount(wallet.address, 'latest');
    if (newNonce > preNonce) {
      console.log(`  ✅ confirmed`);
      return tx;
    }
    process.stdout.write('.');
  }
  throw new Error(`Timeout for ${label}`);
}

async function main() {
  const l2 = new ethers.JsonRpcProvider(L2_RPC);
  const wallet = new ethers.Wallet(ADMIN_KEY, l2);

  console.log('Admin:', wallet.address);

  // 1. Update oracle price (getPrice reverts if stale, so always update)
  console.log('\n[1] Updating oracle price to 1.5e18...');
  await sendTx(wallet, l2, {
    to: ORACLE,
    data: encodeCall('updatePrice(uint256)', INITIAL_PRICE),
    gasLimit: 100000n,
  }, 'updatePrice');

  const newPrice = BigInt(await l2.call({ to: ORACLE, data: encodeCall('getPrice() returns (uint256)') }));
  console.log('Oracle price:', newPrice.toString());

  // 2. Register WUSDC with paymaster
  console.log('\n[2] Register WUSDC with paymaster');
  const stRaw = await l2.call({ to: PAYMASTER, data: encodeCall('supportedTokens(address) returns (uint256)', WUSDC) });
  const isEnabled = BigInt('0x' + stRaw.slice(2, 66)) !== 0n;
  console.log('WUSDC registered:', isEnabled);

  if (!isEnabled) {
    console.log('Calling addToken...');
    await sendTx(wallet, l2, {
      to: PAYMASTER,
      data: encodeCall('addToken(address,address,uint256,uint8)', WUSDC, ORACLE, MARKUP_PCT, DECIMALS),
      gasLimit: 200000n,
    }, 'addToken WUSDC');

    const stRaw2 = await l2.call({ to: PAYMASTER, data: encodeCall('supportedTokens(address) returns (uint256)', WUSDC) });
    const isEnabled2 = BigInt('0x' + stRaw2.slice(2, 66)) !== 0n;
    console.log('WUSDC registered after addToken:', isEnabled2);
  }

  console.log('\n=== AA PAYMASTER SETUP COMPLETE ===');
  const finalPrice = BigInt(await l2.call({ to: ORACLE, data: encodeCall('getPrice() returns (uint256)') }));
  console.log('Oracle price:', finalPrice.toString());
  const stFinal = await l2.call({ to: PAYMASTER, data: encodeCall('supportedTokens(address) returns (uint256)', WUSDC) });
  console.log('WUSDC enabled:', BigInt('0x' + stFinal.slice(2, 66)) !== 0n);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
