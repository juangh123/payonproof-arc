// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PayOnProofJobs} from "../PayOnProofJobs.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// @dev Shared fixture + helpers. Contains no test functions.
abstract contract PayOnProofJobsTestBase is Test {
    PayOnProofJobs internal jobs;
    MockUSDC internal usdc;

    address internal client = makeAddr("client");
    address internal provider = makeAddr("provider");
    address internal evaluator = makeAddr("evaluator");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant MAX_BUDGET = 100e6;
    uint256 internal constant BUDGET = 10e6;
    uint256 internal constant TTL = 1 days;
    bytes32 internal constant DELIVERABLE = keccak256("deliverable");
    bytes32 internal constant REASON = keccak256("reason");

    function setUp() public virtual {
        usdc = new MockUSDC();
        jobs = new PayOnProofJobs(address(usdc), MAX_BUDGET);
        usdc.mint(client, 1_000e6);
        vm.prank(client);
        usdc.approve(address(jobs), type(uint256).max);
    }

    /// @dev Job with provider assigned, still Open, budget 0.
    function _create() internal returns (uint256 id) {
        vm.prank(client);
        id = jobs.createJob(provider, evaluator, block.timestamp + TTL, "build a thing", address(0));
    }

    /// @dev Open job with provider and BUDGET set.
    function _open() internal returns (uint256 id) {
        id = _create();
        vm.prank(client);
        jobs.setBudget(id, BUDGET, "");
    }

    function _funded() internal returns (uint256 id) {
        id = _open();
        vm.prank(client);
        jobs.fund(id, BUDGET, "");
    }

    function _submitted() internal returns (uint256 id) {
        id = _funded();
        vm.prank(provider);
        jobs.submit(id, DELIVERABLE, "");
    }

    function _status(uint256 id) internal view returns (PayOnProofJobs.Status) {
        return jobs.getJob(id).status;
    }

    function _expiry(uint256 id) internal view returns (uint256) {
        return jobs.getJob(id).expiredAt;
    }

    function _invalidStatus(PayOnProofJobs.Status s) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(PayOnProofJobs.InvalidStatus.selector, s);
    }
}
