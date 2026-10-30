// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PayOnProofJobs} from "../PayOnProofJobs.sol";

/// @notice Deploys PayOnProofJobs using PAYMENT_TOKEN and MAX_BUDGET from the environment.
/// @dev Arc (testnet and mainnet) USDC ERC-20 interface: 0x3600000000000000000000000000000000000000.
/// MAX_BUDGET is in 6-decimal units (100 USDC = 100000000).
/// Example:
///   PAYMENT_TOKEN=0x3600000000000000000000000000000000000000 MAX_BUDGET=100000000 \
///   forge script contracts/script/Deploy.s.sol --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast
contract Deploy is Script {
    function run() external returns (PayOnProofJobs jobs) {
        address paymentToken = vm.envAddress("PAYMENT_TOKEN");
        uint256 maxBudget = vm.envUint("MAX_BUDGET");

        vm.startBroadcast();
        jobs = new PayOnProofJobs(paymentToken, maxBudget);
        vm.stopBroadcast();

        console.log("PayOnProofJobs deployed at:", address(jobs));
        console.log("paymentToken:", paymentToken);
        console.log("maxBudget:", maxBudget);
    }
}
