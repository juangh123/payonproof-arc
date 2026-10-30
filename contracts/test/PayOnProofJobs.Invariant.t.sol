// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {PayOnProofJobs} from "../PayOnProofJobs.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// @dev Drives only VALID actions across several jobs. Every call is expected to succeed
/// (the invariant suite runs with fail_on_revert = true), so an unexpected revert is a finding.
contract PayOnProofHandler is CommonBase, StdCheats, StdUtils {
    uint256 internal constant MAX_JOBS = 12;

    PayOnProofJobs public jobs;
    MockUSDC public usdc;

    address[2] internal clients;
    address[2] internal providers;
    address[2] internal evaluators;

    // ghost state
    mapping(uint256 => uint256) public payouts; // times a job paid its provider
    mapping(uint256 => uint256) public refunds; // times a job refunded its client
    mapping(uint256 => bool) public terminalSeen;
    mapping(uint256 => PayOnProofJobs.Status) public terminalStatus;
    bool public terminalLeft;
    uint256 public ghostFunded;
    uint256 public ghostPaid;
    uint256 public ghostRefunded;

    // coverage counters
    uint256 public nCreated;
    uint256 public nFunded;
    uint256 public nSubmitted;
    uint256 public nCompleted;
    uint256 public nRejectedEscrow;
    uint256 public nRejectedOpen;
    uint256 public nClaimed;

    constructor(PayOnProofJobs _jobs, MockUSDC _usdc) {
        jobs = _jobs;
        usdc = _usdc;
        for (uint256 i; i < 2; ++i) {
            clients[i] = address(uint160(0xC11E0 + i));
            providers[i] = address(uint160(0xB20D0 + i));
            evaluators[i] = address(uint160(0xE7A10 + i));
            usdc.mint(clients[i], 1e30);
            vm.prank(clients[i]);
            usdc.approve(address(jobs), type(uint256).max);
        }
    }

    // ───────── helpers ─────────

    function jobIdCount() external view returns (uint256) {
        return jobs.jobCount();
    }

    /// @dev Finds (scanning from a seeded offset) a job eligible for the given action kind.
    /// 1 setProvider, 2 setBudget, 3 fund, 4 submit, 5 complete, 6 rejectEscrow, 7 rejectOpen, 8 claim.
    function _pickFor(uint256 seed, uint8 kind) internal view returns (uint256) {
        uint256 n = jobs.jobCount();
        for (uint256 k; k < n; ++k) {
            uint256 id = ((seed % n + k) % n) + 1;
            PayOnProofJobs.Job memory j = jobs.getJob(id);
            PayOnProofJobs.Status s = j.status;
            bool open = s == PayOnProofJobs.Status.Open;
            bool escrowed = s == PayOnProofJobs.Status.Funded || s == PayOnProofJobs.Status.Submitted;
            bool ok;
            if (kind == 1) ok = open && j.provider == address(0);
            else if (kind == 2) ok = open;
            else if (kind == 3) ok = open && j.provider != address(0) && j.budget != 0 && block.timestamp < j.expiredAt;
            else if (kind == 4) ok = s == PayOnProofJobs.Status.Funded && block.timestamp < j.expiredAt;
            else if (kind == 5) ok = s == PayOnProofJobs.Status.Submitted;
            else if (kind == 6) ok = escrowed;
            else if (kind == 7) ok = open;
            else ok = escrowed && block.timestamp >= j.expiredAt;
            if (ok) return id;
        }
        return 0;
    }

    function _sync() internal {
        uint256 n = jobs.jobCount();
        for (uint256 id = 1; id <= n; ++id) {
            PayOnProofJobs.Status s = jobs.getJob(id).status;
            if (terminalSeen[id]) {
                if (s != terminalStatus[id]) terminalLeft = true;
            } else if (uint8(s) >= uint8(PayOnProofJobs.Status.Completed)) {
                terminalSeen[id] = true;
                terminalStatus[id] = s;
            }
        }
    }

    // ───────── actions ─────────

    function createJob(uint256 seed) external {
        if (jobs.jobCount() >= MAX_JOBS) return;
        address c = clients[seed % 2];
        uint256 evIdx = (seed >> 8) % 3;
        address e = evIdx == 2 ? c : evaluators[evIdx]; // evIdx 2: client is evaluator
        address p = (seed >> 16) % 2 == 0 ? providers[(seed >> 24) % 2] : address(0);
        uint256 ttl = 5 minutes + ((seed >> 32) % 3 days);
        vm.prank(c);
        jobs.createJob(p, e, block.timestamp + ttl, "job", address(0));
        ++nCreated;
        _sync();
    }

    function setProvider(uint256 jobSeed, uint256 pSeed) external {
        uint256 id = _pickFor(jobSeed, 1);
        if (id == 0) return;
        PayOnProofJobs.Job memory j = jobs.getJob(id);
        if (j.status != PayOnProofJobs.Status.Open || j.provider != address(0)) return;
        vm.prank(j.client);
        jobs.setProvider(id, providers[pSeed % 2]);
        _sync();
    }

    function setBudget(uint256 jobSeed, uint256 amount, bool byProvider) external {
        uint256 id = _pickFor(jobSeed, 2);
        if (id == 0) return;
        PayOnProofJobs.Job memory j = jobs.getJob(id);
        if (j.status != PayOnProofJobs.Status.Open) return;
        amount = bound(amount, 1, jobs.maxBudget());
        vm.prank(byProvider && j.provider != address(0) ? j.provider : j.client);
        jobs.setBudget(id, amount, "");
        _sync();
    }

    function fund(uint256 jobSeed) external {
        uint256 id = _pickFor(jobSeed, 3);
        if (id == 0) return;
        PayOnProofJobs.Job memory j = jobs.getJob(id);
        if (j.status != PayOnProofJobs.Status.Open || j.provider == address(0) || j.budget == 0) return;
        if (block.timestamp >= j.expiredAt) return;
        uint256 before = usdc.balanceOf(address(jobs));
        vm.prank(j.client);
        jobs.fund(id, j.budget, "");
        require(usdc.balanceOf(address(jobs)) == before + j.budget, "fund balance delta");
        ghostFunded += j.budget;
        ++nFunded;
        _sync();
    }

    function submit(uint256 jobSeed, uint256 dSeed) external {
        uint256 id = _pickFor(jobSeed, 4);
        if (id == 0) return;
        PayOnProofJobs.Job memory j = jobs.getJob(id);
        if (j.status != PayOnProofJobs.Status.Funded || block.timestamp >= j.expiredAt) return;
        vm.prank(j.provider);
        jobs.submit(id, keccak256(abi.encode(dSeed)), "");
        ++nSubmitted;
        _sync();
    }

    function complete(uint256 jobSeed) external {
        uint256 id = _pickFor(jobSeed, 5);
        if (id == 0) return;
        PayOnProofJobs.Job memory j = jobs.getJob(id);
        if (j.status != PayOnProofJobs.Status.Submitted) return;
        uint256 provBefore = usdc.balanceOf(j.provider);
        vm.prank(j.evaluator);
        jobs.complete(id, bytes32(jobSeed), "");
        require(usdc.balanceOf(j.provider) == provBefore + j.budget, "provider payout delta");
        ++payouts[id];
        ghostPaid += j.budget;
        ++nCompleted;
        _sync();
    }

    function reject(uint256 jobSeed) external {
        // Open rejections are rare (1 in 32) so jobs are not all killed before being funded.
        uint256 id = jobSeed % 32 == 0 ? _pickFor(jobSeed >> 3, 7) : _pickFor(jobSeed >> 3, 6);
        if (id == 0) return;
        PayOnProofJobs.Job memory j = jobs.getJob(id);
        uint256 clientBefore = usdc.balanceOf(j.client);
        if (j.status == PayOnProofJobs.Status.Open) {
            vm.prank(j.client);
            jobs.reject(id, bytes32(jobSeed), "");
            require(usdc.balanceOf(j.client) == clientBefore, "open reject moved funds");
            ++nRejectedOpen;
        } else if (j.status == PayOnProofJobs.Status.Funded || j.status == PayOnProofJobs.Status.Submitted) {
            vm.prank(j.evaluator);
            jobs.reject(id, bytes32(jobSeed), "");
            require(usdc.balanceOf(j.client) == clientBefore + j.budget, "client refund delta");
            ++refunds[id];
            ghostRefunded += j.budget;
            ++nRejectedEscrow;
        } else {
            return;
        }
        _sync();
    }

    function claimRefund(uint256 jobSeed, uint256 callerSeed) external {
        uint256 id = _pickFor(jobSeed, 8);
        if (id == 0) return;
        PayOnProofJobs.Job memory j = jobs.getJob(id);
        if (j.status != PayOnProofJobs.Status.Funded && j.status != PayOnProofJobs.Status.Submitted) return;
        if (block.timestamp < j.expiredAt) return;
        uint256 clientBefore = usdc.balanceOf(j.client);
        address caller = address(uint160(bound(callerSeed, 1, type(uint160).max)));
        vm.prank(caller);
        jobs.claimRefund(id);
        require(usdc.balanceOf(j.client) == clientBefore + j.budget, "claim refund delta");
        ++refunds[id];
        ghostRefunded += j.budget;
        ++nClaimed;
        _sync();
    }

    function warp(uint256 delta) external {
        delta = bound(delta, 0, 2 days);
        vm.warp(block.timestamp + delta);
    }
}

contract PayOnProofJobsInvariantTest is StdInvariant, Test {
    PayOnProofJobs internal jobs;
    MockUSDC internal usdc;
    PayOnProofHandler internal handler;

    function setUp() public {
        usdc = new MockUSDC();
        jobs = new PayOnProofJobs(address(usdc), 100e6);
        handler = new PayOnProofHandler(jobs, usdc);

        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](8);
        selectors[0] = PayOnProofHandler.createJob.selector;
        selectors[1] = PayOnProofHandler.setProvider.selector;
        selectors[2] = PayOnProofHandler.setBudget.selector;
        selectors[3] = PayOnProofHandler.fund.selector;
        selectors[4] = PayOnProofHandler.submit.selector;
        selectors[5] = PayOnProofHandler.complete.selector;
        selectors[6] = PayOnProofHandler.reject.selector;
        selectors[7] = PayOnProofHandler.claimRefund.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        // warp is a separate selector set so time advances at a useful rate
        bytes4[] memory warpSel = new bytes4[](1);
        warpSel[0] = PayOnProofHandler.warp.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: warpSel}));
    }

    /// forge-config: default.invariant.fail_on_revert = true
    /// forge-config: default.invariant.runs = 100
    /// forge-config: default.invariant.depth = 250
    function invariant_TokenBalanceEqualsTotalEscrowed() public view {
        assertEq(usdc.balanceOf(address(jobs)), jobs.totalEscrowed());
    }

    /// forge-config: default.invariant.fail_on_revert = true
    /// forge-config: default.invariant.runs = 100
    /// forge-config: default.invariant.depth = 250
    function invariant_TotalEscrowedEqualsLiveBudgets() public view {
        uint256 sum;
        uint256 n = jobs.jobCount();
        for (uint256 id = 1; id <= n; ++id) {
            PayOnProofJobs.Job memory j = jobs.getJob(id);
            if (j.status == PayOnProofJobs.Status.Funded || j.status == PayOnProofJobs.Status.Submitted) {
                sum += j.budget;
            }
        }
        assertEq(sum, jobs.totalEscrowed());
    }

    /// forge-config: default.invariant.fail_on_revert = true
    /// forge-config: default.invariant.runs = 100
    /// forge-config: default.invariant.depth = 250
    function invariant_FundsConserved() public view {
        // everything ever funded is either still escrowed, paid out, or refunded
        assertEq(handler.ghostFunded(), handler.ghostPaid() + handler.ghostRefunded() + jobs.totalEscrowed());
    }

    /// forge-config: default.invariant.fail_on_revert = true
    /// forge-config: default.invariant.runs = 100
    /// forge-config: default.invariant.depth = 250
    function invariant_NoJobSettlesMoreThanOnce() public view {
        uint256 n = jobs.jobCount();
        for (uint256 id = 1; id <= n; ++id) {
            uint256 p = handler.payouts(id);
            uint256 r = handler.refunds(id);
            assertLe(p, 1, "paid more than once");
            assertLe(r, 1, "refunded more than once");
            assertLe(p + r, 1, "paid and refunded");
            PayOnProofJobs.Status s = jobs.getJob(id).status;
            if (s == PayOnProofJobs.Status.Completed) assertEq(p, 1);
            if (s == PayOnProofJobs.Status.Expired) assertEq(r, 1);
        }
    }

    /// forge-config: default.invariant.fail_on_revert = true
    /// forge-config: default.invariant.runs = 100
    /// forge-config: default.invariant.depth = 250
    function invariant_TerminalStatusesAreNeverLeft() public view {
        assertFalse(handler.terminalLeft());
        uint256 n = jobs.jobCount();
        for (uint256 id = 1; id <= n; ++id) {
            if (handler.terminalSeen(id)) {
                assertEq(uint8(jobs.getJob(id).status), uint8(handler.terminalStatus(id)));
            }
        }
    }

    function afterInvariant() public view {
        console2.log("created", handler.nCreated());
        console2.log("funded", handler.nFunded());
        console2.log("submitted", handler.nSubmitted());
        console2.log("completed", handler.nCompleted());
        console2.log("rejectedEscrow", handler.nRejectedEscrow());
        console2.log("rejectedOpen", handler.nRejectedOpen());
        console2.log("claimed", handler.nClaimed());
    }
}
