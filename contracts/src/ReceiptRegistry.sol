// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ReceiptRegistry {
    enum ReceiptType {
        Analysis,
        Simulation,
        Execution,
        Refusal
    }

    struct StrategyReceipt {
        uint256 id;
        address user;
        address agent;
        address authorizedBy;
        bytes32 policyId;
        bytes32 policyHash;
        bytes32 authorizationHash;
        bytes32 strategyHash;
        bytes32 marketSnapshotHash;
        ReceiptType receiptType;
        string summary;
        string reason;
        uint256 timestamp;
        bytes32 executionTxHash;
    }

    struct ReceiptInput {
        address user;
        address agent;
        address authorizedBy;
        bytes32 policyId;
        bytes32 policyHash;
        bytes32 authorizationHash;
        bytes32 strategyHash;
        bytes32 marketSnapshotHash;
        string summary;
        string reason;
        bytes32 executionTxHash;
    }

    address public owner;
    uint256 public nextReceiptId = 1;

    mapping(address recorder => bool) public authorizedRecorder;
    mapping(uint256 id => StrategyReceipt) private receipts;
    mapping(address user => uint256[]) private receiptsByUser;
    mapping(address agent => uint256[]) private receiptsByAgent;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event RecorderUpdated(address indexed recorder, bool authorized);
    event ReceiptRecorded(
        uint256 indexed id,
        address indexed user,
        address indexed agent,
        bytes32 policyId,
        ReceiptType receiptType
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "ONLY_OWNER");
        _;
    }

    modifier onlyRecorder() {
        require(authorizedRecorder[msg.sender], "ONLY_RECORDER");
        _;
    }

    constructor() {
        owner = msg.sender;
        authorizedRecorder[msg.sender] = true;
        emit OwnershipTransferred(address(0), msg.sender);
        emit RecorderUpdated(msg.sender, true);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ZERO_OWNER");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setRecorder(address recorder, bool authorized) external onlyOwner {
        require(recorder != address(0), "ZERO_RECORDER");
        authorizedRecorder[recorder] = authorized;
        emit RecorderUpdated(recorder, authorized);
    }

    function recordExecution(ReceiptInput calldata input) external onlyRecorder returns (uint256 id) {
        id = _record(input, ReceiptType.Execution);
    }

    function recordRefusal(ReceiptInput calldata input) external onlyRecorder returns (uint256 id) {
        id = _record(input, ReceiptType.Refusal);
    }

    function getReceiptsByUser(address user) external view returns (uint256[] memory) {
        return receiptsByUser[user];
    }

    function getReceiptsByAgent(address agent) external view returns (uint256[] memory) {
        return receiptsByAgent[agent];
    }

    function getReceipt(uint256 id) external view returns (StrategyReceipt memory) {
        require(receipts[id].id != 0, "RECEIPT_NOT_FOUND");
        return receipts[id];
    }

    function _record(ReceiptInput calldata input, ReceiptType receiptType) private returns (uint256 id) {
        require(input.user != address(0), "ZERO_USER");
        require(input.agent != address(0), "ZERO_AGENT");

        id = nextReceiptId++;
        receipts[id] = StrategyReceipt({
            id: id,
            user: input.user,
            agent: input.agent,
            authorizedBy: input.authorizedBy,
            policyId: input.policyId,
            policyHash: input.policyHash,
            authorizationHash: input.authorizationHash,
            strategyHash: input.strategyHash,
            marketSnapshotHash: input.marketSnapshotHash,
            receiptType: receiptType,
            summary: input.summary,
            reason: input.reason,
            timestamp: block.timestamp,
            executionTxHash: input.executionTxHash
        });

        receiptsByUser[input.user].push(id);
        receiptsByAgent[input.agent].push(id);

        emit ReceiptRecorded(id, input.user, input.agent, input.policyId, receiptType);
    }
}

