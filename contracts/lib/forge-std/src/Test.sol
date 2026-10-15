// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Vm.sol";

contract Test {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertTrue(bool condition) internal pure {
        require(condition, "assertTrue failed");
    }

    function assertEq(bool left, bool right) internal pure {
        require(left == right, "assertEq(bool) failed");
    }

    function assertEq(uint8 left, uint8 right) internal pure {
        require(left == right, "assertEq(uint8) failed");
    }

    function assertEq(uint256 left, uint256 right) internal pure {
        require(left == right, "assertEq(uint256) failed");
    }

    function assertEq(uint64 left, uint64 right) internal pure {
        require(left == right, "assertEq(uint64) failed");
    }

    function assertEq(bytes32 left, bytes32 right) internal pure {
        require(left == right, "assertEq(bytes32) failed");
    }

    function assertEq(address left, address right) internal pure {
        require(left == right, "assertEq(address) failed");
    }
}
