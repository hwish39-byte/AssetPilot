// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console2.sol";
import "../src/PolicyCommitment.sol";

contract DeployPolicyCommitment is Script {
    function run() external returns (PolicyCommitment commitment) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(privateKey);
        commitment = new PolicyCommitment();
        vm.stopBroadcast();

        console2.log("PolicyCommitment deployed", address(commitment));
        console2.log("Chain ID", block.chainid);
        console2.log("Deployer", tx.origin);
    }
}
