import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const envPath = resolve(root, ".env.deploy");
const deploymentPath = resolve(root, "deployments", "monad-testnet.json");
const frontendEnvPath = resolve(root, "frontend", ".env.local");

function parseEnv(path) {
  const env = {};
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function requireEnv(env, key) {
  const value = env[key];
  if (!value) throw new Error(`Missing ${key} in .env.deploy`);
  return value;
}

function mask(text, secrets) {
  let masked = text;
  for (const secret of secrets) {
    if (!secret) continue;
    masked = masked.split(secret).join("<redacted>");
  }
  return masked;
}

function run(command, args, secrets, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 20 * 1024 * 1024
  });

  const stdout = mask(result.stdout ?? "", secrets);
  const stderr = mask(result.stderr ?? "", secrets);

  if (options.print !== false) {
    if (stdout.trim()) process.stdout.write(stdout);
    if (stderr.trim()) process.stderr.write(stderr);
  }

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status}`);
  }

  return { stdout, stderr };
}

function deploy(name, contract, constructorArgs, context) {
  console.log(`\nDeploying ${name}...`);
  const args = [
    "create",
    contract,
    "--rpc-url",
    context.rpcUrl,
    "--private-key",
    context.privateKey,
    "--broadcast"
  ];

  if (constructorArgs.length > 0) {
    args.push("--constructor-args", ...constructorArgs);
  }

  const { stdout } = run("forge", args, context.secrets);

  const match = stdout.match(/Deployed to:\s*(0x[a-fA-F0-9]{40})/);
  if (!match) throw new Error(`Could not parse deployed address for ${name}`);
  console.log(`${name}: ${match[1]}`);
  return match[1];
}

function send(label, to, signature, args, context) {
  console.log(`\n${label}...`);
  run("cast", [
    "send",
    to,
    signature,
    ...args,
    "--rpc-url",
    context.rpcUrl,
    "--private-key",
    context.privateKey
  ], context.secrets, { print: true });
}

function updateEnvFile(path, updates) {
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const lines = existing ? existing.split(/\r?\n/) : [];
  const seen = new Set();
  const updatedLines = lines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match) return line;
    const key = match[1];
    if (!(key in updates)) return line;
    seen.add(key);
    return `${key}=${updates[key]}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) updatedLines.push(`${key}=${value}`);
  }

  writeFileSync(path, updatedLines.join("\n").replace(/\n*$/, "\n"));
}

if (!existsSync(envPath)) {
  throw new Error(".env.deploy not found");
}

const env = parseEnv(envPath);
const rpcUrl = requireEnv(env, "RPC_URL");
const privateKey = requireEnv(env, "PRIVATE_KEY");
const userAddress = requireEnv(env, "USER_ADDRESS");
const agentAddress = env.AGENT_ADDRESS || userAddress;
const secrets = [privateKey, rpcUrl, env.LLM_API_KEY, env.OPENAI_API_KEY].filter(Boolean);
const context = { rpcUrl, privateKey, userAddress, agentAddress, secrets };
const one = "000000000000000000";

console.log("Starting AssetPilot contract deployment. Secrets are redacted from output.");
console.log(`User address: ${userAddress}`);
console.log(`Agent address: ${agentAddress}`);

const tokens = {
  mNVDA: deploy("mNVDA", "contracts/src/MockERC20.sol:MockERC20", ["Mock NVIDIA", "mNVDA", "18"], context),
  mAAPL: deploy("mAAPL", "contracts/src/MockERC20.sol:MockERC20", ["Mock Apple", "mAAPL", "18"], context),
  mSPY: deploy("mSPY", "contracts/src/MockERC20.sol:MockERC20", ["Mock SPY", "mSPY", "18"], context),
  USDC: deploy("USDC", "contracts/src/MockERC20.sol:MockERC20", ["Mock USDC", "USDC", "18"], context),
  mTSLA: deploy("mTSLA", "contracts/src/MockERC20.sol:MockERC20", ["Mock Tesla", "mTSLA", "18"], context)
};

const oracle = deploy("MockPriceOracle", "contracts/src/MockPriceOracle.sol:MockPriceOracle", [], context);

send("Setting mNVDA price", oracle, "setPrice(address,uint256)", [tokens.mNVDA, `125${one}`], context);
send("Setting mAAPL price", oracle, "setPrice(address,uint256)", [tokens.mAAPL, `210${one}`], context);
send("Setting mSPY price", oracle, "setPrice(address,uint256)", [tokens.mSPY, `550${one}`], context);
send("Setting USDC price", oracle, "setPrice(address,uint256)", [tokens.USDC, `1${one}`], context);
send("Setting mTSLA price", oracle, "setPrice(address,uint256)", [tokens.mTSLA, `300${one}`], context);

const amm = deploy("MockAMM", "contracts/src/MockAMM.sol:MockAMM", [oracle], context);
const policyVault = deploy("PolicyVault", "contracts/src/PolicyVault.sol:PolicyVault", [], context);
const receiptRegistry = deploy("ReceiptRegistry", "contracts/src/ReceiptRegistry.sol:ReceiptRegistry", [], context);
const strategyExecutor = deploy("StrategyExecutor", "contracts/src/StrategyExecutor.sol:StrategyExecutor", [policyVault, receiptRegistry, amm, oracle], context);

send("Authorizing StrategyExecutor as receipt recorder", receiptRegistry, "setRecorder(address,bool)", [strategyExecutor, "true"], context);

send("Minting mNVDA to user", tokens.mNVDA, "mint(address,uint256)", [userAddress, `100${one}`], context);
send("Minting mAAPL to user", tokens.mAAPL, "mint(address,uint256)", [userAddress, `100${one}`], context);
send("Minting USDC to user", tokens.USDC, "mint(address,uint256)", [userAddress, `10000${one}`], context);

send("Minting mSPY liquidity to AMM", tokens.mSPY, "mint(address,uint256)", [amm, `1000${one}`], context);
send("Minting mAAPL liquidity to AMM", tokens.mAAPL, "mint(address,uint256)", [amm, `1000${one}`], context);
send("Minting USDC liquidity to AMM", tokens.USDC, "mint(address,uint256)", [amm, `1000000${one}`], context);
send("Minting mTSLA liquidity to AMM", tokens.mTSLA, "mint(address,uint256)", [amm, `1000${one}`], context);

const deployment = {
  network: "monad-testnet",
  chainId: 10143,
  deployedAt: new Date().toISOString(),
  userAddress,
  agentAddress,
  contracts: {
    policyVault,
    strategyExecutor,
    receiptRegistry,
    mockPriceOracle: oracle,
    mockAMM: amm
  },
  tokens
};

mkdirSync(dirname(deploymentPath), { recursive: true });
writeFileSync(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`);

updateEnvFile(frontendEnvPath, {
  NEXT_PUBLIC_POLICY_VAULT_ADDRESS: policyVault,
  NEXT_PUBLIC_STRATEGY_EXECUTOR_ADDRESS: strategyExecutor,
  NEXT_PUBLIC_RECEIPT_REGISTRY_ADDRESS: receiptRegistry,
  NEXT_PUBLIC_AGENT_ADDRESS: agentAddress,
  NEXT_PUBLIC_TOKEN_MNVDA_ADDRESS: tokens.mNVDA,
  NEXT_PUBLIC_TOKEN_MAAPL_ADDRESS: tokens.mAAPL,
  NEXT_PUBLIC_TOKEN_MSPY_ADDRESS: tokens.mSPY,
  NEXT_PUBLIC_TOKEN_USDC_ADDRESS: tokens.USDC,
  NEXT_PUBLIC_TOKEN_MTSLA_ADDRESS: tokens.mTSLA
});

console.log("\nDeployment complete.");
console.log(`Public deployment file: ${deploymentPath}`);
console.log(`Updated frontend env: ${frontendEnvPath}`);
