// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library console2 {
    address constant CONSOLE = 0x000000000000000000636F6e736F6c652e6c6f67;

    function log(string memory value) internal view {
        _sendLogPayload(abi.encodeWithSignature("log(string)", value));
    }

    function log(string memory label, address value) internal view {
        _sendLogPayload(abi.encodeWithSignature("log(string,address)", label, value));
    }

    function log(string memory label, uint256 value) internal view {
        _sendLogPayload(abi.encodeWithSignature("log(string,uint256)", label, value));
    }

    function _sendLogPayload(bytes memory payload) private view {
        address console = CONSOLE;
        assembly {
            pop(staticcall(gas(), console, add(payload, 32), mload(payload), 0, 0))
        }
    }
}
