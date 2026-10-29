const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("EvidenceRegistry", function () {
  async function deploy() {
    const Registry = await ethers.getContractFactory("EvidenceRegistry");
    const registry = await Registry.deploy();
    await registry.waitForDeployment();
    return registry;
  }
  it("registers a hash and emits a verifiable event", async function () {
    const registry = await deploy();
    const hash = ethers.keccak256(ethers.toUtf8Bytes("demo file fingerprint"));
    await expect(registry.registerEvidence(hash, "IP-TEST-001"))
      .to.emit(registry, "EvidenceRegistered").withArgs(hash, "IP-TEST-001", (await ethers.getSigners())[0].address, anyValue);
    const record = await registry.getEvidence(hash);
    expect(record.exists).to.equal(true);
    expect(record.registrant).to.equal((await ethers.getSigners())[0].address);
    expect(record.registeredAt).to.be.greaterThan(0n);
  });
  it("rejects duplicate hashes", async function () {
    const registry = await deploy();
    const hash = ethers.keccak256(ethers.toUtf8Bytes("same file"));
    await registry.registerEvidence(hash, "IP-TEST-002");
    await expect(registry.registerEvidence(hash, "IP-TEST-003")).to.be.revertedWithCustomError(registry, "AlreadyRegistered");
  });
  it("rejects an empty reference id", async function () {
    const registry = await deploy();
    const hash = ethers.keccak256(ethers.toUtf8Bytes("file"));
    await expect(registry.registerEvidence(hash, "")).to.be.revertedWithCustomError(registry, "EmptyReferenceId");
  });
});
