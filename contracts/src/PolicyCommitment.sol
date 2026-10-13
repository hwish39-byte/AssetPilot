// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PolicyCommitment {
    event PolicyCommitted(
        bytes32 indexed policyHash,
        address indexed submitter,
        uint64 expiresAt,
        uint256 timestamp
    );

    struct Commitment {
        uint64 expiresAt;
        uint64 timestamp;
    }

    mapping(address => mapping(bytes32 => Commitment)) public commitments;

    error PolicyHashRequired();
    error PolicyExpired(uint64 expiresAt);
    error PolicyAlreadyCommitted(address submitter, bytes32 policyHash);

    function commitPolicy(bytes32 policyHash, uint64 expiresAt) external {
        if (policyHash == bytes32(0)) revert PolicyHashRequired();
        if (expiresAt <= block.timestamp) revert PolicyExpired(expiresAt);

        Commitment storage existing = commitments[msg.sender][policyHash];
        if (existing.timestamp != 0) revert PolicyAlreadyCommitted(msg.sender, policyHash);

        commitments[msg.sender][policyHash] = Commitment({
            expiresAt: expiresAt,
            timestamp: uint64(block.timestamp)
        });

        emit PolicyCommitted(policyHash, msg.sender, expiresAt, block.timestamp);
    }

    function isCommitted(address submitter, bytes32 policyHash) external view returns (bool) {
        return commitments[submitter][policyHash].timestamp != 0;
    }
}
