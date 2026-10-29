const hre = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const Registry = await hre.ethers.getContractFactory("EvidenceRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  console.log(`EvidenceRegistry deployed to: ${address}`);
  const envPath = path.join(__dirname, "..", ".env");
  let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  if (/^CONTRACT_ADDRESS=.*$/m.test(env)) env = env.replace(/^CONTRACT_ADDRESS=.*$/m, `CONTRACT_ADDRESS=${address}`);
  else env += `\nCONTRACT_ADDRESS=${address}\n`;
  fs.writeFileSync(envPath, env);
  console.log("Updated CONTRACT_ADDRESS in .env");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
