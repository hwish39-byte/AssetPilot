// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockPriceOracle {
    struct MarketSnapshot {
        bytes32 snapshotHash;
        string source;
        uint256 createdAt;
        uint256 validUntil;
        address signedBy;
    }

    address public owner;

    mapping(address token => uint256 priceUsd) public prices;
    mapping(bytes32 snapshotHash => MarketSnapshot) private snapshots;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event PriceUpdated(address indexed token, uint256 priceUsd);
    event SnapshotCreated(bytes32 indexed snapshotHash, string source, uint256 validUntil, address indexed signedBy);

    modifier onlyOwner() {
        require(msg.sender == owner, "ONLY_OWNER");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ZERO_OWNER");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setPrice(address token, uint256 priceUsd) external onlyOwner {
        require(token != address(0), "ZERO_TOKEN");
        require(priceUsd > 0, "ZERO_PRICE");
        prices[token] = priceUsd;
        emit PriceUpdated(token, priceUsd);
    }

    function getPrice(address token) external view returns (uint256) {
        uint256 price = prices[token];
        require(price > 0, "PRICE_NOT_SET");
        return price;
    }

    function createSnapshot(string calldata source, uint256 validUntil) external returns (bytes32 snapshotHash) {
        require(validUntil > block.timestamp, "INVALID_VALID_UNTIL");

        snapshotHash = keccak256(abi.encode(source, block.timestamp, validUntil, msg.sender, block.chainid));
        snapshots[snapshotHash] = MarketSnapshot({
            snapshotHash: snapshotHash,
            source: source,
            createdAt: block.timestamp,
            validUntil: validUntil,
            signedBy: msg.sender
        });

        emit SnapshotCreated(snapshotHash, source, validUntil, msg.sender);
    }

    function getSnapshot(bytes32 snapshotHash) external view returns (MarketSnapshot memory) {
        MarketSnapshot memory snapshot = snapshots[snapshotHash];
        require(snapshot.snapshotHash != bytes32(0), "SNAPSHOT_NOT_FOUND");
        return snapshot;
    }
}

