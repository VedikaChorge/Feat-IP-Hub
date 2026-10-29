// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Stores file fingerprints and non-sensitive evidence references, not files.
/// @dev A registration proves a hash was submitted to this contract at a block time;
/// it does not establish legal ownership or the truth of a document.
contract EvidenceRegistry {
    struct Record {
        address registrant;
        uint64 registeredAt;
        bool exists;
    }

    mapping(bytes32 => Record) private records;
    event EvidenceRegistered(bytes32 indexed fileHash, string referenceId, address indexed registrant, uint64 registeredAt);

    error AlreadyRegistered(bytes32 fileHash);
    error EmptyReferenceId();
    error EmptyHash();

    function registerEvidence(bytes32 fileHash, string calldata referenceId) external {
        if (fileHash == bytes32(0)) revert EmptyHash();
        if (bytes(referenceId).length == 0) revert EmptyReferenceId();
        if (records[fileHash].exists) revert AlreadyRegistered(fileHash);
        uint64 ts = uint64(block.timestamp);
        records[fileHash] = Record({registrant: msg.sender, registeredAt: ts, exists: true});
        emit EvidenceRegistered(fileHash, referenceId, msg.sender, ts);
    }

    function getEvidence(bytes32 fileHash) external view returns (address registrant, uint64 registeredAt, bool exists) {
        Record memory record = records[fileHash];
        return (record.registrant, record.registeredAt, record.exists);
    }
}
