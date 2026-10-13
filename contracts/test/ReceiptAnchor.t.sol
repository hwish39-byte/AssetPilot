// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ReceiptAnchor.sol";

contract ReceiptAnchorTest is Test {
    event ReceiptAnchored(
        bytes32 indexed receiptHash,
        bytes32 indexed workflowHash,
        bytes32 previousReceiptHash,
        uint8 receiptType,
        address indexed submitter,
        uint256 timestamp
    );

    ReceiptAnchor private anchor;

    bytes32 private constant RECEIPT_HASH = keccak256("assetpilot.receipt");
    bytes32 private constant WORKFLOW_HASH = keccak256("assetpilot.workflow");
    bytes32 private constant PREVIOUS_RECEIPT_HASH = keccak256("assetpilot.previous");
    uint8 private constant RECEIPT_TYPE = 1;
    address private constant SUBMITTER = address(0xBEEF);

    function setUp() public {
        anchor = new ReceiptAnchor();
    }

    function testAnchorReceiptStoresAnchor() public {
        vm.prank(SUBMITTER);
        anchor.anchorReceipt(RECEIPT_HASH, WORKFLOW_HASH, PREVIOUS_RECEIPT_HASH, RECEIPT_TYPE);

        (bytes32 workflowHash, bytes32 previousReceiptHash, uint8 receiptType, address submitter, uint64 timestamp) = anchor.anchors(RECEIPT_HASH);

        assertTrue(anchor.anchored(RECEIPT_HASH));
        assertTrue(anchor.isAnchored(RECEIPT_HASH));
        assertEq(workflowHash, WORKFLOW_HASH);
        assertEq(previousReceiptHash, PREVIOUS_RECEIPT_HASH);
        assertEq(uint256(receiptType), uint256(RECEIPT_TYPE));
        assertEq(submitter, SUBMITTER);
        assertEq(uint256(timestamp), block.timestamp);
    }

    function testZeroReceiptHashReverts() public {
        vm.expectRevert(ReceiptAnchor.ReceiptHashRequired.selector);
        anchor.anchorReceipt(bytes32(0), WORKFLOW_HASH, PREVIOUS_RECEIPT_HASH, RECEIPT_TYPE);
    }

    function testDuplicateReceiptHashReverts() public {
        anchor.anchorReceipt(RECEIPT_HASH, WORKFLOW_HASH, PREVIOUS_RECEIPT_HASH, RECEIPT_TYPE);

        vm.expectRevert(abi.encodeWithSelector(ReceiptAnchor.ReceiptAlreadyAnchored.selector, RECEIPT_HASH));
        anchor.anchorReceipt(RECEIPT_HASH, WORKFLOW_HASH, PREVIOUS_RECEIPT_HASH, RECEIPT_TYPE);
    }

    function testEmitsReceiptAnchored() public {
        vm.expectEmit(true, true, true, true, address(anchor));
        emit ReceiptAnchored(RECEIPT_HASH, WORKFLOW_HASH, PREVIOUS_RECEIPT_HASH, RECEIPT_TYPE, SUBMITTER, block.timestamp);

        vm.prank(SUBMITTER);
        anchor.anchorReceipt(RECEIPT_HASH, WORKFLOW_HASH, PREVIOUS_RECEIPT_HASH, RECEIPT_TYPE);
    }
}
