// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console2.sol";
import "../src/ReceiptAnchor.sol";

contract DeployReceiptAnchor is Script {
    function run() external returns (ReceiptAnchor anchor) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(privateKey);
        anchor = new ReceiptAnchor();
        vm.stopBroadcast();

        console2.log("ReceiptAnchor deployed", address(anchor));
        console2.log("Chain ID", block.chainid);
        console2.log("Deployer", tx.origin);
    }
}
