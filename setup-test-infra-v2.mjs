/**
 * Deploy MinimalAccount + setup WUSDC fee token for AA smoke test.
 * Uses gasPrice = baseFee + 1 to minimize gas costs.
 */
import { ethers } from 'ethers';
import { readFileSync } from 'fs';

const L2_RPC = 'http://localhost:8545';
const ADMIN_KEY = '0x679d88a9fb565707c0aff9434f9c141fee0b197455c12a52868b5d94bac694f9';
const ENTRYPOINT = '0x4200000000000000000000000000000000000063';
const ORACLE = '0x4200000000000000000000000000000000000066';
const PAYMASTER = '0x4200000000000000000000000000000000000067';
const WUSDC = '0x4200000000000000000000000000000000000006'; // Wrapped native USDC (18 dec)

const EP_DEPOSIT_TARGET = 100_000_000n; // 100 USDC (6-dec units) for paymaster EP

function encodeCall(sig, ...args) {
  const iface = new ethers.Interface([`function ${sig}`]);
  return iface.encodeFunctionData(sig.split('(')[0], args);
}

async function getGasPrice(provider) {
  const block = await provider.getBlock('latest');
  const baseFee = block?.baseFeePerGas ?? 1000n;
  // Use baseFee + small priority fee (1% above baseFee minimum)
  return baseFee + baseFee / 100n + 1n;
}

async function sendTx(wallet, provider, txParams, label) {
  const gasPrice = await getGasPrice(provider);
  const preNonce = await provider.getTransactionCount(wallet.address, 'latest');

  let gasLimit = txParams.gasLimit;
  if (!gasLimit) {
    try {
      const est = await provider.estimateGas({ from: wallet.address, ...txParams });
      gasLimit = est * 11n / 10n; // 10% buffer
    } catch(e) {
      gasLimit = 200000n;
      console.log(`  Gas estimate failed for ${label}: ${e.message.slice(0,50)}`);
    }
  }

  const cost = gasPrice * gasLimit;
  console.log(`  ${label}: gasLimit=${gasLimit} gasPrice=${gasPrice} cost=${Number(cost)/1e6} USDC`);

  const tx = await wallet.sendTransaction({ ...txParams, type: 0, gasPrice, gasLimit });
  console.log(`  Sent: ${tx.hash.slice(0,14)}...`);

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const newNonce = await provider.getTransactionCount(wallet.address, 'latest');
    if (newNonce > preNonce) {
      const bal = await provider.getBalance(wallet.address);
      console.log(`  ✅ confirmed (balance: ${Number(bal)/1e6} USDC remaining)`);
      return tx;
    }
    process.stdout.write('.');
  }
  throw new Error(`Timeout for ${label}`);
}

async function main() {
  const l2 = new ethers.JsonRpcProvider(L2_RPC);
  const wallet = new ethers.Wallet(ADMIN_KEY, l2);
  const adminAddr = wallet.address;

  const startBal = await l2.getBalance(adminAddr);
  console.log('Admin:', adminAddr);
  console.log('Balance:', Number(startBal)/1e6, 'USDC');
  console.log('Nonce:', await l2.getTransactionCount(adminAddr, 'latest'));

  // ── 1. Deploy MinimalAccount ──────────────────────────────────────────────
  console.log('\n[1] Deploy MinimalAccount');
  const artifact = JSON.parse(readFileSync('/tmp/aa-test-account/out/MinimalAccount.sol/MinimalAccount.json', 'utf8'));
  const deployBytecode = artifact.bytecode.object +
    new ethers.Interface(['constructor(address)']).encodeDeploy([adminAddr]).slice(2);

  const currentNonce = await l2.getTransactionCount(adminAddr, 'latest');
  const accountAddr = ethers.getCreateAddress({ from: adminAddr, nonce: currentNonce });
  console.log('Expected address:', accountAddr);

  const existingCode = await l2.getCode(accountAddr);
  if (existingCode !== '0x') {
    console.log('Already deployed!');
  } else {
    await sendTx(wallet, l2, { data: deployBytecode }, 'deploy MinimalAccount');
    const code = await l2.getCode(accountAddr);
    if (code === '0x') throw new Error('Deployment failed - no code');
    console.log('Deployed:', code.length/2-1, 'bytes');
  }

  // ── 2. Ensure paymaster EP deposit is sufficient ──────────────────────────
  console.log('\n[2] Top up paymaster EP deposit');
  const pmDep = BigInt(await l2.call({ to: ENTRYPOINT, data: encodeCall('balanceOf(address) returns (uint256)', PAYMASTER) }));
  console.log('Current EP deposit:', pmDep.toString(), '=', Number(pmDep)/1e6, 'USDC');

  if (pmDep < EP_DEPOSIT_TARGET) {
    const needed = EP_DEPOSIT_TARGET - pmDep;
    await sendTx(wallet, l2, {
      to: ENTRYPOINT,
      value: needed,
      data: encodeCall('depositTo(address)', PAYMASTER),
      gasLimit: 80000n,
    }, 'EP depositTo');
    const newDep = BigInt(await l2.call({ to: ENTRYPOINT, data: encodeCall('balanceOf(address) returns (uint256)', PAYMASTER) }));
    console.log('New EP deposit:', Number(newDep)/1e6, 'USDC');
  } else {
    console.log('EP deposit sufficient');
  }

  // ── 3. Wrap native USDC to WUSDC, fund MinimalAccount ────────────────────
  console.log('\n[3] Fund MinimalAccount with WUSDC');

  // Check existing WUSDC balance of MinimalAccount
  const wusdcBal = BigInt(await l2.call({
    to: WUSDC,
    data: encodeCall('balanceOf(address) returns (uint256)', accountAddr)
  }));
  console.log('Current WUSDC balance:', wusdcBal.toString());

  if (wusdcBal === 0n) {
    // First, deposit 50 native USDC to WUSDC (for admin)
    const wrapAmount = 50_000_000n; // 50 USDC native (6-dec)
    console.log('Wrapping 50 native USDC → WUSDC');
    await sendTx(wallet, l2, {
      to: WUSDC,
      value: wrapAmount,
      data: encodeCall('deposit()'),
      gasLimit: 80000n,
    }, 'WUSDC deposit');

    const adminWusdc = BigInt(await l2.call({
      to: WUSDC,
      data: encodeCall('balanceOf(address) returns (uint256)', adminAddr)
    }));
    console.log('Admin WUSDC balance:', adminWusdc.toString());

    // Transfer WUSDC to MinimalAccount
    await sendTx(wallet, l2, {
      to: WUSDC,
      data: encodeCall('transfer(address,uint256)', accountAddr, adminWusdc),
      gasLimit: 80000n,
    }, 'transfer WUSDC');

    const newBal = BigInt(await l2.call({
      to: WUSDC,
      data: encodeCall('balanceOf(address) returns (uint256)', accountAddr)
    }));
    console.log('MinimalAccount WUSDC:', newBal.toString());
  }

  // ── 4. Approve paymaster to spend WUSDC from MinimalAccount ──────────────
  console.log('\n[4] Set WUSDC allowance: MinimalAccount → paymaster');
  const allowance = BigInt(await l2.call({
    to: WUSDC,
    data: encodeCall('allowance(address,address) returns (uint256)', accountAddr, PAYMASTER)
  }));
  console.log('Current allowance:', allowance.toString());

  if (allowance === 0n) {
    // Call MinimalAccount.execute(WUSDC, 0, approve(PAYMASTER, MAX_UINT256))
    const maxUint256 = 2n**256n - 1n;
    const approveData = encodeCall('approve(address,uint256)', PAYMASTER, maxUint256);
    await sendTx(wallet, l2, {
      to: accountAddr,
      data: encodeCall('execute(address,uint256,bytes)', WUSDC, 0n, approveData),
      gasLimit: 100000n,
    }, 'approve WUSDC');

    const newAllowance = BigInt(await l2.call({
      to: WUSDC,
      data: encodeCall('allowance(address,address) returns (uint256)', accountAddr, PAYMASTER)
    }));
    console.log('New allowance:', newAllowance.toString());
  } else {
    console.log('Allowance already set');
  }

  // ── 5. Verify WUSDC is registered with paymaster ──────────────────────────
  console.log('\n[5] Verify WUSDC registration');
  const stRaw = await l2.call({ to: PAYMASTER, data: encodeCall('supportedTokens(address) returns (uint256)', WUSDC) });
  console.log('WUSDC enabled:', BigInt(stRaw.slice(0, 66)) !== 0n || BigInt('0x' + stRaw.slice(2, 66)) !== 0n);

  // ── Final state ──────────────────────────────────────────────────────────
  console.log('\n=== FINAL STATE ===');
  const finalBal = await l2.getBalance(adminAddr);
  console.log('Admin native balance:', Number(finalBal)/1e6, 'USDC');
  const acctWusdc = BigInt(await l2.call({ to: WUSDC, data: encodeCall('balanceOf(address) returns (uint256)', accountAddr) }));
  console.log('MinimalAccount WUSDC:', acctWusdc.toString());
  const pmDepFinal = BigInt(await l2.call({ to: ENTRYPOINT, data: encodeCall('balanceOf(address) returns (uint256)', PAYMASTER) }));
  console.log('Paymaster EP deposit:', Number(pmDepFinal)/1e6, 'USDC');
  const finalAllowance = BigInt(await l2.call({ to: WUSDC, data: encodeCall('allowance(address,address) returns (uint256)', accountAddr, PAYMASTER) }));
  console.log('WUSDC allowance to paymaster:', finalAllowance > 0n ? 'SET' : 'MISSING');

  console.log('\n✅ MinimalAccount:', accountAddr);
  console.log('   WUSDC token:', WUSDC);
  console.log('   Oracle:', ORACLE);
  console.log('   Paymaster:', PAYMASTER);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
