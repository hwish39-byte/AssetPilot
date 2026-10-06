// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PolicyVault {
    struct Policy {
        address user;
        address agent;
        uint256 maxSpendUsd;
        uint256 maxSingleTradeUsd;
        uint256 maxSlippageBps;
        uint256 expiresAt;
        bool requireSimulation;
        uint256 nonce;
    }

    mapping(bytes32 policyId => mapping(address token => bool)) public allowedAsset;
    mapping(bytes32 policyId => mapping(address token => bool)) public blockedAsset;

    mapping(bytes32 policyId => Policy) private policies;
    mapping(bytes32 policyId => bool) public policyExists;
    mapping(bytes32 policyId => bool) public revoked;
    mapping(address user => uint256) public nonces;

    event PolicyCreated(bytes32 indexed policyId, address indexed user, address indexed agent, uint256 nonce);
    event PolicyRevoked(bytes32 indexed policyId, address indexed user);
    event AssetAllowed(bytes32 indexed policyId, address indexed token, bool allowed);
    event AssetBlocked(bytes32 indexed policyId, address indexed token, bool blocked);

    function createPolicy(
        address agent,
        uint256 maxSpendUsd,
        uint256 maxSingleTradeUsd,
        uint256 maxSlippageBps,
        uint256 expiresAt,
        bool requireSimulation,
        address[] calldata allowedAssets,
        address[] calldata blockedAssets
    ) external returns (bytes32 policyId) {
        require(agent != address(0), "ZERO_AGENT");
        require(expiresAt > block.timestamp, "INVALID_EXPIRY");
        require(maxSlippageBps <= 10_000, "INVALID_SLIPPAGE");
        require(maxSingleTradeUsd <= maxSpendUsd, "SINGLE_GT_TOTAL");

        uint256 nonce = nonces[msg.sender]++;
        policyId = keccak256(abi.encode(msg.sender, agent, nonce, block.chainid, address(this)));

        policies[policyId] = Policy({
            user: msg.sender,
            agent: agent,
            maxSpendUsd: maxSpendUsd,
            maxSingleTradeUsd: maxSingleTradeUsd,
            maxSlippageBps: maxSlippageBps,
            expiresAt: expiresAt,
            requireSimulation: requireSimulation,
            nonce: nonce
        });
        policyExists[policyId] = true;

        for (uint256 i = 0; i < allowedAssets.length; i++) {
            require(allowedAssets[i] != address(0), "ZERO_ALLOWED_ASSET");
            allowedAsset[policyId][allowedAssets[i]] = true;
            emit AssetAllowed(policyId, allowedAssets[i], true);
        }

        for (uint256 i = 0; i < blockedAssets.length; i++) {
            require(blockedAssets[i] != address(0), "ZERO_BLOCKED_ASSET");
            blockedAsset[policyId][blockedAssets[i]] = true;
            emit AssetBlocked(policyId, blockedAssets[i], true);
        }

        emit PolicyCreated(policyId, msg.sender, agent, nonce);
    }

    function revokePolicy(bytes32 policyId) external {
        Policy memory policy = policies[policyId];
        require(policyExists[policyId], "POLICY_NOT_FOUND");
        require(policy.user == msg.sender, "ONLY_POLICY_USER");
        revoked[policyId] = true;
        emit PolicyRevoked(policyId, msg.sender);
    }

    function getPolicy(bytes32 policyId) external view returns (Policy memory) {
        require(policyExists[policyId], "POLICY_NOT_FOUND");
        return policies[policyId];
    }

    function isAllowedAsset(bytes32 policyId, address token) external view returns (bool) {
        return allowedAsset[policyId][token];
    }

    function isBlockedAsset(bytes32 policyId, address token) external view returns (bool) {
        return blockedAsset[policyId][token];
    }

    function verifyAuthorization(bytes32 policyId, address agent) external view returns (bool) {
        if (!policyExists[policyId] || revoked[policyId]) {
            return false;
        }

        Policy memory policy = policies[policyId];
        return policy.agent == agent && policy.expiresAt >= block.timestamp;
    }

    function hashPolicy(bytes32 policyId) external view returns (bytes32) {
        require(policyExists[policyId], "POLICY_NOT_FOUND");
        Policy memory policy = policies[policyId];
        return keccak256(abi.encode(policy));
    }
}

