// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockAMM} from "../src/MockAMM.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {MockPriceOracle} from "../src/MockPriceOracle.sol";
import {PolicyVault} from "../src/PolicyVault.sol";
import {ReceiptRegistry} from "../src/ReceiptRegistry.sol";
import {StrategyExecutor} from "../src/StrategyExecutor.sol";

interface Vm {
    function expectEmit(bool checkTopic1, bool checkTopic2, bool checkTopic3, bool checkData, address emitter) external;
    function prank(address msgSender) external;
    function startPrank(address msgSender) external;
    function stopPrank() external;
    function warp(uint256 newTimestamp) external;
}

contract AgentActor {
    StrategyExecutor public immutable executor;

    constructor(StrategyExecutor executor_) {
        executor = executor_;
    }

    function execute(
        bytes32 policyId,
        StrategyExecutor.Action[] calldata actions,
        StrategyExecutor.StrategyMeta calldata meta
    ) external returns (bool, uint256, string memory) {
        return executor.executeStrategy(policyId, actions, meta);
    }
}

contract AssetPilotContractsTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant ONE = 1e18;

    address private constant USER = address(0xA11CE);

    MockERC20 private mNVDA;
    MockERC20 private mAAPL;
    MockERC20 private mSPY;
    MockERC20 private mTSLA;
    MockERC20 private usdc;
    MockPriceOracle private oracle;
    MockAMM private amm;
    PolicyVault private vault;
    ReceiptRegistry private receipts;
    StrategyExecutor private executor;
    AgentActor private agentA;
    AgentActor private agentB;

    event PolicyCreated(bytes32 indexed policyId, address indexed user, address indexed agent, uint256 nonce);
    event ReceiptRecorded(
        uint256 indexed id,
        address indexed user,
        address indexed agent,
        bytes32 policyId,
        ReceiptRegistry.ReceiptType receiptType
    );
    event StrategyExecuted(bytes32 indexed policyId, address indexed user, address indexed agent, uint256 receiptId);
    event StrategyRefused(bytes32 indexed policyId, address indexed user, address indexed agent, string reason, uint256 receiptId);

    struct BalanceSnapshot {
        uint256 userNVDA;
        uint256 userAAPL;
        uint256 userSPY;
        uint256 userTSLA;
        uint256 userUSDC;
        uint256 ammNVDA;
        uint256 ammAAPL;
        uint256 ammSPY;
        uint256 ammTSLA;
        uint256 ammUSDC;
    }

    function setUp() public {
        mNVDA = new MockERC20("Mock NVIDIA", "mNVDA", 18);
        mAAPL = new MockERC20("Mock Apple", "mAAPL", 18);
        mSPY = new MockERC20("Mock SPY", "mSPY", 18);
        mTSLA = new MockERC20("Mock Tesla", "mTSLA", 18);
        usdc = new MockERC20("Mock USDC", "USDC", 18);

        oracle = new MockPriceOracle();
        oracle.setPrice(address(mNVDA), 125 * ONE);
        oracle.setPrice(address(mAAPL), 210 * ONE);
        oracle.setPrice(address(mSPY), 550 * ONE);
        oracle.setPrice(address(mTSLA), 300 * ONE);
        oracle.setPrice(address(usdc), ONE);

        amm = new MockAMM(address(oracle));
        vault = new PolicyVault();
        receipts = new ReceiptRegistry();
        executor = new StrategyExecutor(address(vault), address(receipts), address(amm), address(oracle));
        agentA = new AgentActor(executor);
        agentB = new AgentActor(executor);
        receipts.setRecorder(address(executor), true);

        mNVDA.mint(USER, 100 * ONE);
        mAAPL.mint(USER, 100 * ONE);
        usdc.mint(USER, 10_000 * ONE);

        mSPY.mint(address(amm), 1_000 * ONE);
        mAAPL.mint(address(amm), 1_000 * ONE);
        usdc.mint(address(amm), 1_000_000 * ONE);
        mTSLA.mint(address(amm), 1_000 * ONE);

        vm.startPrank(USER);
        mNVDA.approve(address(executor), type(uint256).max);
        mAAPL.approve(address(executor), type(uint256).max);
        usdc.approve(address(executor), type(uint256).max);
        vm.stopPrank();
    }

    function testSuccessfulRebalanceRecordsExecutionReceipt() public {
        StrategyExecutor.StrategyMeta memory meta = _meta();
        bytes32 policyId = _createPolicy(address(agentA), _allowedCoreAssets(), _blockedTesla(), block.timestamp + 30 minutes);
        StrategyExecutor.Action[] memory actions = _singleAction(address(mNVDA), address(mSPY), ONE, 0);
        uint256 expectedBuyAmount = actions[0].expectedBuyAmount;
        uint256 nextReceiptId = receipts.nextReceiptId();
        uint256 nvdaBefore = mNVDA.balanceOf(USER);
        uint256 spyBefore = mSPY.balanceOf(USER);

        _expectExecutionEvents(policyId, address(agentA), nextReceiptId);
        (bool success, uint256 receiptId, string memory reason) = agentA.execute(policyId, actions, meta);

        require(success, "expected success");
        require(receiptId == nextReceiptId, "wrong receipt id");
        require(bytes(reason).length == 0, "unexpected reason");
        require(mNVDA.balanceOf(USER) == nvdaBefore - ONE, "mNVDA not reduced");
        require(mSPY.balanceOf(USER) == spyBefore + expectedBuyAmount, "mSPY not increased");
        _assertReceipt(receiptId, ReceiptRegistry.ReceiptType.Execution, USER, address(agentA), policyId, meta, "");
    }

    function testBuyTokenNotAllowedRecordsRefusalReceipt() public {
        bytes32 policyId = _createPolicy(address(agentA), _allowedCoreAssets(), _emptyAssets(), block.timestamp + 30 minutes);
        StrategyExecutor.Action[] memory actions = _singleAction(address(mNVDA), address(mTSLA), ONE, 0);

        _executeRefusalAndAssertNoMovement(policyId, actions, address(agentA), "BUY_TOKEN_NOT_ALLOWED");
    }

    function testBuyTokenBlockedRecordsRefusalReceipt() public {
        bytes32 policyId = _createPolicy(address(agentA), _allowedAssetsWithTesla(), _blockedTesla(), block.timestamp + 30 minutes);
        StrategyExecutor.Action[] memory actions = _singleAction(address(mNVDA), address(mTSLA), ONE, 0);

        _executeRefusalAndAssertNoMovement(policyId, actions, address(agentA), "BUY_TOKEN_BLOCKED");
    }

    function testSlippageTooHighRecordsRefusalReceipt() public {
        bytes32 policyId = _createPolicy(address(agentA), _allowedCoreAssets(), _emptyAssets(), block.timestamp + 30 minutes);
        StrategyExecutor.Action[] memory actions = _singleAction(address(mNVDA), address(mSPY), ONE, 101);

        _executeRefusalAndAssertNoMovement(policyId, actions, address(agentA), "SLIPPAGE_TOO_HIGH");
    }

    function testMaxSpendExceededRecordsRefusalReceipt() public {
        bytes32 policyId = _createPolicy(address(agentA), _allowedCoreAssets(), _emptyAssets(), block.timestamp + 30 minutes);
        StrategyExecutor.Action[] memory actions = new StrategyExecutor.Action[](3);
        actions[0] = _action(address(mNVDA), address(usdc), 2 * ONE, 0);
        actions[1] = _action(address(mNVDA), address(usdc), 2 * ONE, 0);
        actions[2] = _action(address(mNVDA), address(usdc), ONE, 0);

        _executeRefusalAndAssertNoMovement(policyId, actions, address(agentA), "MAX_SPEND_EXCEEDED");
    }

    function testMaxSingleTradeExceededRecordsRefusalReceipt() public {
        bytes32 policyId = _createPolicy(address(agentA), _allowedCoreAssets(), _emptyAssets(), block.timestamp + 30 minutes);
        StrategyExecutor.Action[] memory actions = _singleAction(address(mNVDA), address(usdc), 3 * ONE, 0);

        _executeRefusalAndAssertNoMovement(policyId, actions, address(agentA), "MAX_SINGLE_TRADE_EXCEEDED");
    }

    function testExpiredPolicyRecordsRefusalReceipt() public {
        bytes32 policyId = _createPolicy(address(agentA), _allowedCoreAssets(), _emptyAssets(), block.timestamp + 1);
        vm.warp(block.timestamp + 2);
        StrategyExecutor.Action[] memory actions = _singleAction(address(mNVDA), address(mSPY), ONE, 0);

        _executeRefusalAndAssertNoMovement(policyId, actions, address(agentA), "POLICY_EXPIRED");
    }

    function testAgentMismatchRecordsRefusalReceipt() public {
        bytes32 policyId = _createPolicy(address(agentA), _allowedCoreAssets(), _emptyAssets(), block.timestamp + 30 minutes);
        StrategyExecutor.Action[] memory actions = _singleAction(address(mNVDA), address(mSPY), ONE, 0);

        _executeRefusalAndAssertNoMovement(policyId, actions, address(agentB), "AGENT_NOT_AUTHORIZED");
    }

    function testSellTokenNotAllowedRecordsRefusalReceipt() public {
        bytes32 policyId = _createPolicy(address(agentA), _allowedCoreAssets(), _emptyAssets(), block.timestamp + 30 minutes);
        StrategyExecutor.Action[] memory actions = _singleAction(address(mTSLA), address(mSPY), ONE, 0);

        _executeRefusalAndAssertNoMovement(policyId, actions, address(agentA), "SELL_TOKEN_NOT_ALLOWED");
    }

    function testSellTokenBlockedRecordsRefusalReceipt() public {
        bytes32 policyId = _createPolicy(address(agentA), _allowedAssetsWithTesla(), _blockedTesla(), block.timestamp + 30 minutes);
        StrategyExecutor.Action[] memory actions = _singleAction(address(mTSLA), address(mSPY), ONE, 0);

        _executeRefusalAndAssertNoMovement(policyId, actions, address(agentA), "SELL_TOKEN_BLOCKED");
    }

    function _createPolicy(
        address agent,
        address[] memory allowed,
        address[] memory blocked,
        uint256 expiresAt
    ) private returns (bytes32 policyId) {
        uint256 nonce = vault.nonces(USER);
        policyId = keccak256(abi.encode(USER, agent, nonce, block.chainid, address(vault)));

        vm.expectEmit(true, true, true, true, address(vault));
        emit PolicyCreated(policyId, USER, agent, nonce);

        vm.prank(USER);
        bytes32 createdPolicyId = vault.createPolicy({
            agent: agent,
            maxSpendUsd: 500 * ONE,
            maxSingleTradeUsd: 300 * ONE,
            maxSlippageBps: 100,
            expiresAt: expiresAt,
            requireSimulation: true,
            allowedAssets: allowed,
            blockedAssets: blocked
        });

        require(createdPolicyId == policyId, "unexpected policy id");
    }

    function _executeRefusalAndAssertNoMovement(
        bytes32 policyId,
        StrategyExecutor.Action[] memory actions,
        address executingAgent,
        string memory expectedReason
    ) private {
        StrategyExecutor.StrategyMeta memory meta = _meta();
        BalanceSnapshot memory beforeBalances = _snapshot();
        uint256 nextReceiptId = receipts.nextReceiptId();

        _expectRefusalEvents(policyId, executingAgent, expectedReason, nextReceiptId);
        (bool success, uint256 receiptId, string memory reason) = _executeAs(executingAgent, policyId, actions, meta);

        require(!success, "expected refusal");
        require(receiptId == nextReceiptId, "wrong receipt id");
        require(_same(reason, expectedReason), "wrong reason");
        _assertBalancesUnchanged(beforeBalances);
        _assertReceipt(receiptId, ReceiptRegistry.ReceiptType.Refusal, USER, executingAgent, policyId, meta, expectedReason);
    }

    function _executeAs(
        address executingAgent,
        bytes32 policyId,
        StrategyExecutor.Action[] memory actions,
        StrategyExecutor.StrategyMeta memory meta
    ) private returns (bool success, uint256 receiptId, string memory reason) {
        if (executingAgent == address(agentA)) {
            return agentA.execute(policyId, actions, meta);
        }
        if (executingAgent == address(agentB)) {
            return agentB.execute(policyId, actions, meta);
        }
        revert("UNKNOWN_AGENT");
    }

    function _expectExecutionEvents(bytes32 policyId, address agent, uint256 receiptId) private {
        vm.expectEmit(true, true, true, true, address(receipts));
        emit ReceiptRecorded(receiptId, USER, agent, policyId, ReceiptRegistry.ReceiptType.Execution);

        vm.expectEmit(true, true, true, true, address(executor));
        emit StrategyExecuted(policyId, USER, agent, receiptId);
    }

    function _expectRefusalEvents(
        bytes32 policyId,
        address agent,
        string memory reason,
        uint256 receiptId
    ) private {
        vm.expectEmit(true, true, true, true, address(receipts));
        emit ReceiptRecorded(receiptId, USER, agent, policyId, ReceiptRegistry.ReceiptType.Refusal);

        vm.expectEmit(true, true, true, true, address(executor));
        emit StrategyRefused(policyId, USER, agent, reason, receiptId);
    }

    function _assertReceipt(
        uint256 receiptId,
        ReceiptRegistry.ReceiptType receiptType,
        address receiptUser,
        address receiptAgent,
        bytes32 policyId,
        StrategyExecutor.StrategyMeta memory meta,
        string memory reason
    ) private view {
        ReceiptRegistry.StrategyReceipt memory receipt = receipts.getReceipt(receiptId);
        require(receipt.receiptType == receiptType, "wrong receipt type");
        require(receipt.user == receiptUser, "wrong receipt user");
        require(receipt.agent == receiptAgent, "wrong receipt agent");
        require(receipt.authorizedBy == USER, "wrong authorized by");
        require(receipt.policyId == policyId, "wrong policy id");
        require(receipt.strategyHash == meta.strategyHash, "wrong strategy hash");
        require(receipt.marketSnapshotHash == meta.marketSnapshotHash, "wrong snapshot hash");
        require(_same(receipt.reason, reason), "wrong receipt reason");

        uint256[] memory userReceipts = receipts.getReceiptsByUser(receiptUser);
        uint256[] memory agentReceipts = receipts.getReceiptsByAgent(receiptAgent);
        require(userReceipts.length == 1 && userReceipts[0] == receiptId, "user receipt not indexed");
        require(agentReceipts.length == 1 && agentReceipts[0] == receiptId, "agent receipt not indexed");
    }

    function _singleAction(
        address sellToken,
        address buyToken,
        uint256 sellAmount,
        uint256 extraMinReductionBps
    ) private view returns (StrategyExecutor.Action[] memory actions) {
        actions = new StrategyExecutor.Action[](1);
        actions[0] = _action(sellToken, buyToken, sellAmount, extraMinReductionBps);
    }

    function _action(
        address sellToken,
        address buyToken,
        uint256 sellAmount,
        uint256 extraMinReductionBps
    ) private view returns (StrategyExecutor.Action memory) {
        uint256 expected = (sellAmount * oracle.prices(sellToken)) / oracle.prices(buyToken);
        uint256 minBuyAmount = (expected * (9_900 - extraMinReductionBps)) / 10_000;

        return StrategyExecutor.Action({
            sellToken: sellToken,
            buyToken: buyToken,
            sellAmount: sellAmount,
            expectedBuyAmount: expected,
            minBuyAmount: minBuyAmount
        });
    }

    function _meta() private returns (StrategyExecutor.StrategyMeta memory) {
        bytes32 marketSnapshotHash = oracle.createSnapshot("assetpilot-test", block.timestamp + 1 hours);
        return StrategyExecutor.StrategyMeta({
            authorizationHash: keccak256("auth"),
            strategyHash: keccak256("sell-mNVDA-buy-mSPY"),
            marketSnapshotHash: marketSnapshotHash,
            summary: "MVP rebalance"
        });
    }

    function _snapshot() private view returns (BalanceSnapshot memory) {
        return BalanceSnapshot({
            userNVDA: mNVDA.balanceOf(USER),
            userAAPL: mAAPL.balanceOf(USER),
            userSPY: mSPY.balanceOf(USER),
            userTSLA: mTSLA.balanceOf(USER),
            userUSDC: usdc.balanceOf(USER),
            ammNVDA: mNVDA.balanceOf(address(amm)),
            ammAAPL: mAAPL.balanceOf(address(amm)),
            ammSPY: mSPY.balanceOf(address(amm)),
            ammTSLA: mTSLA.balanceOf(address(amm)),
            ammUSDC: usdc.balanceOf(address(amm))
        });
    }

    function _assertBalancesUnchanged(BalanceSnapshot memory beforeBalances) private view {
        require(mNVDA.balanceOf(USER) == beforeBalances.userNVDA, "user mNVDA changed");
        require(mAAPL.balanceOf(USER) == beforeBalances.userAAPL, "user mAAPL changed");
        require(mSPY.balanceOf(USER) == beforeBalances.userSPY, "user mSPY changed");
        require(mTSLA.balanceOf(USER) == beforeBalances.userTSLA, "user mTSLA changed");
        require(usdc.balanceOf(USER) == beforeBalances.userUSDC, "user USDC changed");
        require(mNVDA.balanceOf(address(amm)) == beforeBalances.ammNVDA, "amm mNVDA changed");
        require(mAAPL.balanceOf(address(amm)) == beforeBalances.ammAAPL, "amm mAAPL changed");
        require(mSPY.balanceOf(address(amm)) == beforeBalances.ammSPY, "amm mSPY changed");
        require(mTSLA.balanceOf(address(amm)) == beforeBalances.ammTSLA, "amm mTSLA changed");
        require(usdc.balanceOf(address(amm)) == beforeBalances.ammUSDC, "amm USDC changed");
    }

    function _allowedCoreAssets() private view returns (address[] memory allowed) {
        allowed = new address[](4);
        allowed[0] = address(mNVDA);
        allowed[1] = address(mAAPL);
        allowed[2] = address(mSPY);
        allowed[3] = address(usdc);
    }

    function _allowedAssetsWithTesla() private view returns (address[] memory allowed) {
        allowed = new address[](5);
        allowed[0] = address(mNVDA);
        allowed[1] = address(mAAPL);
        allowed[2] = address(mSPY);
        allowed[3] = address(usdc);
        allowed[4] = address(mTSLA);
    }

    function _blockedTesla() private view returns (address[] memory blocked) {
        blocked = new address[](1);
        blocked[0] = address(mTSLA);
    }

    function _emptyAssets() private pure returns (address[] memory) {
        return new address[](0);
    }

    function _same(string memory a, string memory b) private pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}
