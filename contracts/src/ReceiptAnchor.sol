// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ReceiptAnchor {
    event ReceiptAnchored(
        bytes32 indexed receiptHash,
        bytes32 indexed workflowHash,
        bytes32 previousReceiptHash,
        uint8 receiptType,
        address indexed submitter,
        uint256 timestamp
    );

    struct Anchor {
        bytes32 workflowHash;
        bytes32 previousReceiptHash;
        uint8 receiptType;
        address submitter;
        uint64 timestamp;
    }

    mapping(bytes32 => bool) public anchored;
    mapping(bytes32 => Anchor) public anchors;

    error ReceiptHashRequired();
    error ReceiptAlreadyAnchored(bytes32 receiptHash);

    function anchorReceipt(
        bytes32 receiptHash,
        bytes32 workflowHash,
        bytes32 previousReceiptHash,
        uint8 receiptType
    ) external {
        if (receiptHash == bytes32(0)) revert ReceiptHashRequired();
        if (anchored[receiptHash]) revert ReceiptAlreadyAnchored(receiptHash);

        anchored[receiptHash] = true;
        anchors[receiptHash] = Anchor({
            workflowHash: workflowHash,
            previousReceiptHash: previousReceiptHash,
            receiptType: receiptType,
            submitter: msg.sender,
            timestamp: uint64(block.timestamp)
        });

        emit ReceiptAnchored(receiptHash, workflowHash, previousReceiptHash, receiptType, msg.sender, block.timestamp);
    }

    function isAnchored(bytes32 receiptHash) external view returns (bool) {
        return anchored[receiptHash];
    }
}
