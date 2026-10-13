// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PolicyCommitment.sol";

contract PolicyCommitmentTest is Test {
    event PolicyCommitted(
        bytes32 indexed policyHash,
        address indexed submitter,
        uint64 expiresAt,
        uint256 timestamp
    );

    PolicyCommitment private commitment;

    bytes32 private constant POLICY_HASH = keccak256("assetpilot.policy");
    address private constant SUBMITTER = address(0xBEEF);
    address private constant OTHER_SUBMITTER = address(0xCAFE);

    function setUp() public {
        commitment = new PolicyCommitment();
    }

    function testCommitPolicyStoresCommitment() public {
        uint64 expiresAt = uint64(block.timestamp + 1 hours);

        vm.prank(SUBMITTER);
        commitment.commitPolicy(POLICY_HASH, expiresAt);

        (uint64 storedExpiresAt, uint64 timestamp) = commitment.commitments(SUBMITTER, POLICY_HASH);

        assertTrue(commitment.isCommitted(SUBMITTER, POLICY_HASH));
        assertEq(uint256(storedExpiresAt), uint256(expiresAt));
        assertEq(uint256(timestamp), block.timestamp);
    }

    function testEmitsPolicyCommitted() public {
        uint64 expiresAt = uint64(block.timestamp + 1 hours);

        vm.expectEmit(true, true, false, true, address(commitment));
        emit PolicyCommitted(POLICY_HASH, SUBMITTER, expiresAt, block.timestamp);

        vm.prank(SUBMITTER);
        commitment.commitPolicy(POLICY_HASH, expiresAt);
    }

    function testZeroPolicyHashReverts() public {
        vm.expectRevert(PolicyCommitment.PolicyHashRequired.selector);
        commitment.commitPolicy(bytes32(0), uint64(block.timestamp + 1 hours));
    }

    function testExpiredPolicyReverts() public {
        uint64 expiresAt = uint64(block.timestamp);

        vm.expectRevert(abi.encodeWithSelector(PolicyCommitment.PolicyExpired.selector, expiresAt));
        commitment.commitPolicy(POLICY_HASH, expiresAt);
    }

    function testDuplicateCommitmentRevertsForSameSubmitter() public {
        uint64 expiresAt = uint64(block.timestamp + 1 hours);

        vm.prank(SUBMITTER);
        commitment.commitPolicy(POLICY_HASH, expiresAt);

        vm.expectRevert(abi.encodeWithSelector(PolicyCommitment.PolicyAlreadyCommitted.selector, SUBMITTER, POLICY_HASH));
        vm.prank(SUBMITTER);
        commitment.commitPolicy(POLICY_HASH, expiresAt + 1 hours);
    }

    function testDifferentSubmittersCanCommitSamePolicyHash() public {
        uint64 expiresAt = uint64(block.timestamp + 1 hours);

        vm.prank(SUBMITTER);
        commitment.commitPolicy(POLICY_HASH, expiresAt);

        vm.prank(OTHER_SUBMITTER);
        commitment.commitPolicy(POLICY_HASH, expiresAt);

        assertTrue(commitment.isCommitted(SUBMITTER, POLICY_HASH));
        assertTrue(commitment.isCommitted(OTHER_SUBMITTER, POLICY_HASH));
    }
}
