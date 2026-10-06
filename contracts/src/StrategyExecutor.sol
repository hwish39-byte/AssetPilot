// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockAMM, IERC20Like, IPriceOracleLike} from "./MockAMM.sol";
import {PolicyVault} from "./PolicyVault.sol";
import {ReceiptRegistry} from "./ReceiptRegistry.sol";

contract StrategyExecutor {
    struct Action {
        address sellToken;
        address buyToken;
        uint256 sellAmount;
        uint256 expectedBuyAmount;
        uint256 minBuyAmount;
    }

    struct StrategyMeta {
        bytes32 authorizationHash;
        bytes32 strategyHash;
        bytes32 marketSnapshotHash;
        string summary;
    }

    PolicyVault public immutable policyVault;
    ReceiptRegistry public immutable receiptRegistry;
    MockAMM public immutable amm;
    IPriceOracleLike public immutable oracle;

    event StrategyExecuted(bytes32 indexed policyId, address indexed user, address indexed agent, uint256 receiptId);
    event StrategyRefused(bytes32 indexed policyId, address indexed user, address indexed agent, string reason, uint256 receiptId);

    constructor(address policyVault_, address receiptRegistry_, address amm_, address oracle_) {
        require(policyVault_ != address(0), "ZERO_POLICY_VAULT");
        require(receiptRegistry_ != address(0), "ZERO_RECEIPT_REGISTRY");
        require(amm_ != address(0), "ZERO_AMM");
        require(oracle_ != address(0), "ZERO_ORACLE");

        policyVault = PolicyVault(policyVault_);
        receiptRegistry = ReceiptRegistry(receiptRegistry_);
        amm = MockAMM(amm_);
        oracle = IPriceOracleLike(oracle_);
    }

    function executeStrategy(
        bytes32 policyId,
        Action[] calldata actions,
        StrategyMeta calldata meta
    ) external returns (bool success, uint256 receiptId, string memory reason) {
        (bool valid, PolicyVault.Policy memory policy, string memory validationReason) = _validate(policyId, actions);
        if (!valid) {
            receiptId = _recordRefusal(policyId, policy, meta, validationReason);
            emit StrategyRefused(policyId, policy.user, msg.sender, validationReason, receiptId);
            return (false, receiptId, validationReason);
        }

        for (uint256 i = 0; i < actions.length; i++) {
            Action calldata action = actions[i];
            require(IERC20Like(action.sellToken).transferFrom(policy.user, address(this), action.sellAmount), "USER_TRANSFER_FAILED");
            require(IERC20Like(action.sellToken).approve(address(amm), action.sellAmount), "AMM_APPROVE_FAILED");

            try amm.swap(action.sellToken, action.buyToken, action.sellAmount, action.minBuyAmount) returns (uint256 buyAmount) {
                require(IERC20Like(action.buyToken).transfer(policy.user, buyAmount), "USER_BUY_TRANSFER_FAILED");
            } catch Error(string memory swapReason) {
                receiptId = _recordRefusal(policyId, policy, meta, swapReason);
                emit StrategyRefused(policyId, policy.user, msg.sender, swapReason, receiptId);
                return (false, receiptId, swapReason);
            } catch {
                reason = "AMM_SWAP_FAILED";
                receiptId = _recordRefusal(policyId, policy, meta, reason);
                emit StrategyRefused(policyId, policy.user, msg.sender, reason, receiptId);
                return (false, receiptId, reason);
            }
        }

        receiptId = receiptRegistry.recordExecution(_receiptInput(policyId, policy, meta, "", _executionHash(policyId, actions, meta)));
        emit StrategyExecuted(policyId, policy.user, msg.sender, receiptId);
        return (true, receiptId, "");
    }

    function _validate(
        bytes32 policyId,
        Action[] calldata actions
    ) private view returns (bool, PolicyVault.Policy memory policy, string memory reason) {
        if (actions.length == 0) {
            return (false, policy, "NO_ACTIONS");
        }

        try policyVault.getPolicy(policyId) returns (PolicyVault.Policy memory loadedPolicy) {
            policy = loadedPolicy;
        } catch {
            return (false, policy, "POLICY_NOT_FOUND");
        }

        if (!policyVault.verifyAuthorization(policyId, msg.sender)) {
            if (policy.expiresAt < block.timestamp) {
                return (false, policy, "POLICY_EXPIRED");
            }
            return (false, policy, "AGENT_NOT_AUTHORIZED");
        }

        uint256 totalSpendUsd;
        for (uint256 i = 0; i < actions.length; i++) {
            Action calldata action = actions[i];

            if (!policyVault.allowedAsset(policyId, action.sellToken)) return (false, policy, "SELL_TOKEN_NOT_ALLOWED");
            if (!policyVault.allowedAsset(policyId, action.buyToken)) return (false, policy, "BUY_TOKEN_NOT_ALLOWED");
            if (policyVault.blockedAsset(policyId, action.sellToken)) return (false, policy, "SELL_TOKEN_BLOCKED");
            if (policyVault.blockedAsset(policyId, action.buyToken)) return (false, policy, "BUY_TOKEN_BLOCKED");

            uint256 spendUsd = (action.sellAmount * oracle.getPrice(action.sellToken)) / 1e18;
            if (spendUsd > policy.maxSingleTradeUsd) return (false, policy, "MAX_SINGLE_TRADE_EXCEEDED");

            totalSpendUsd += spendUsd;
            if (totalSpendUsd > policy.maxSpendUsd) return (false, policy, "MAX_SPEND_EXCEEDED");

            uint256 minAllowed = (action.expectedBuyAmount * (10_000 - policy.maxSlippageBps)) / 10_000;
            if (action.minBuyAmount < minAllowed) return (false, policy, "SLIPPAGE_TOO_HIGH");
        }

        return (true, policy, "");
    }

    function _recordRefusal(
        bytes32 policyId,
        PolicyVault.Policy memory policy,
        StrategyMeta calldata meta,
        string memory reason
    ) private returns (uint256) {
        return receiptRegistry.recordRefusal(_receiptInput(policyId, policy, meta, reason, bytes32(0)));
    }

    function _receiptInput(
        bytes32 policyId,
        PolicyVault.Policy memory policy,
        StrategyMeta calldata meta,
        string memory reason,
        bytes32 executionTxHash
    ) private view returns (ReceiptRegistry.ReceiptInput memory) {
        bytes32 policyHash = policy.user == address(0) ? bytes32(0) : keccak256(abi.encode(policy));
        return ReceiptRegistry.ReceiptInput({
            user: policy.user == address(0) ? msg.sender : policy.user,
            agent: msg.sender,
            authorizedBy: policy.user,
            policyId: policyId,
            policyHash: policyHash,
            authorizationHash: meta.authorizationHash,
            strategyHash: meta.strategyHash,
            marketSnapshotHash: meta.marketSnapshotHash,
            summary: meta.summary,
            reason: reason,
            executionTxHash: executionTxHash
        });
    }

    function _executionHash(
        bytes32 policyId,
        Action[] calldata actions,
        StrategyMeta calldata meta
    ) private view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), policyId, actions, meta.strategyHash, block.number));
    }
}

