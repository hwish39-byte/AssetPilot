// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface Vm {
    function envUint(string calldata name) external returns (uint256 value);
    function expectEmit(bool checkTopic1, bool checkTopic2, bool checkTopic3, bool checkData, address emitter) external;
    function expectRevert(bytes4 revertData) external;
    function expectRevert(bytes calldata revertData) external;
    function prank(address msgSender) external;
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}
