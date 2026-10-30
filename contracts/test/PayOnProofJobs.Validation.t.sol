// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PayOnProofJobs} from "../PayOnProofJobs.sol";
import {PayOnProofJobsTestBase} from "./PayOnProofJobs.Base.t.sol";

/// @dev Input validation and budget fuzz tests.
contract PayOnProofJobsValidationTest is PayOnProofJobsTestBase {
    function _createNoProvider() internal returns (uint256 id) {
        vm.prank(client);
        id = jobs.createJob(address(0), evaluator, block.timestamp + TTL, "x", address(0));
    }

    function _str(uint256 len) internal pure returns (string memory) {
        return string(new bytes(len));
    }

    // ───────────── createJob ─────────────

    function test_Create_ZeroEvaluatorReverts() public {
        vm.prank(client);
        vm.expectRevert(PayOnProofJobs.InvalidEvaluator.selector);
        jobs.createJob(provider, address(0), block.timestamp + TTL, "x", address(0));
    }

    function test_Create_ProviderEqualsClientReverts() public {
        vm.prank(client);
        vm.expectRevert(PayOnProofJobs.InvalidProvider.selector);
        jobs.createJob(client, evaluator, block.timestamp + TTL, "x", address(0));
    }

    function test_Create_ProviderEqualsEvaluatorReverts() public {
        vm.prank(client);
        vm.expectRevert(PayOnProofJobs.InvalidProvider.selector);
        jobs.createJob(evaluator, evaluator, block.timestamp + TTL, "x", address(0));
    }

    function test_Create_ExpiryBelowFiveMinutesReverts() public {
        vm.startPrank(client);
        vm.expectRevert(PayOnProofJobs.InvalidExpiry.selector);
        jobs.createJob(provider, evaluator, block.timestamp + 5 minutes - 1, "x", address(0));
        vm.expectRevert(PayOnProofJobs.InvalidExpiry.selector);
        jobs.createJob(provider, evaluator, 0, "x", address(0));
        vm.expectRevert(PayOnProofJobs.InvalidExpiry.selector);
        jobs.createJob(provider, evaluator, block.timestamp, "x", address(0));
        vm.stopPrank();
        assertEq(jobs.jobCount(), 0);
    }

    function test_Create_ExpiryExactlyFiveMinutesOk() public {
        vm.prank(client);
        uint256 id = jobs.createJob(provider, evaluator, block.timestamp + 5 minutes, "x", address(0));
        assertEq(_expiry(id), block.timestamp + 5 minutes);
    }

    function test_Create_NonZeroHookReverts() public {
        vm.prank(client);
        vm.expectRevert(PayOnProofJobs.HooksUnsupported.selector);
        jobs.createJob(provider, evaluator, block.timestamp + TTL, "x", makeAddr("hook"));
    }

    function test_Create_DescriptionOver280BytesReverts() public {
        vm.prank(client);
        vm.expectRevert(PayOnProofJobs.DescriptionTooLong.selector);
        jobs.createJob(provider, evaluator, block.timestamp + TTL, _str(281), address(0));
    }

    function test_Create_DescriptionExactly280BytesOk() public {
        vm.prank(client);
        uint256 id = jobs.createJob(provider, evaluator, block.timestamp + TTL, _str(280), address(0));
        assertEq(bytes(jobs.getJob(id).description).length, 280);
    }

    function test_Create_DescriptionLimitIsBytesNotCharacters() public {
        // "é" is 2 bytes in UTF-8: 140 chars = 280 bytes OK, 141 chars = 282 bytes reverts.
        bytes memory ok = new bytes(280);
        bytes memory bad = new bytes(282);
        for (uint256 i; i < 140; ++i) {
            ok[2 * i] = 0xC3;
            ok[2 * i + 1] = 0xA9;
        }
        for (uint256 i; i < 141; ++i) {
            bad[2 * i] = 0xC3;
            bad[2 * i + 1] = 0xA9;
        }
        vm.startPrank(client);
        jobs.createJob(provider, evaluator, block.timestamp + TTL, string(ok), address(0));
        vm.expectRevert(PayOnProofJobs.DescriptionTooLong.selector);
        jobs.createJob(provider, evaluator, block.timestamp + TTL, string(bad), address(0));
        vm.stopPrank();
    }

    // ───────────── setProvider ─────────────

    function test_SetProvider_AlreadySetReverts() public {
        uint256 id = _create();
        vm.prank(client);
        vm.expectRevert(PayOnProofJobs.ProviderAlreadySet.selector);
        jobs.setProvider(id, makeAddr("other"));
        vm.prank(client);
        vm.expectRevert(PayOnProofJobs.ProviderAlreadySet.selector);
        jobs.setProvider(id, provider);
    }

    function test_SetProvider_AfterSetProviderReverts() public {
        uint256 id = _createNoProvider();
        vm.startPrank(client);
        jobs.setProvider(id, provider);
        vm.expectRevert(PayOnProofJobs.ProviderAlreadySet.selector);
        jobs.setProvider(id, makeAddr("other"));
        vm.stopPrank();
        assertEq(jobs.getJob(id).provider, provider);
    }

    function test_SetProvider_ZeroClientEvaluatorRevert() public {
        uint256 id = _createNoProvider();
        vm.startPrank(client);
        vm.expectRevert(PayOnProofJobs.InvalidProvider.selector);
        jobs.setProvider(id, address(0));
        vm.expectRevert(PayOnProofJobs.InvalidProvider.selector);
        jobs.setProvider(id, client);
        vm.expectRevert(PayOnProofJobs.InvalidProvider.selector);
        jobs.setProvider(id, evaluator);
        vm.stopPrank();
    }

    // ───────────── setBudget ─────────────

    function test_SetBudget_ZeroReverts() public {
        uint256 id = _create();
        vm.prank(client);
        vm.expectRevert(PayOnProofJobs.InvalidBudget.selector);
        jobs.setBudget(id, 0, "");
    }

    function test_SetBudget_AboveMaxReverts_MaxOk() public {
        uint256 id = _create();
        vm.startPrank(client);
        vm.expectRevert(PayOnProofJobs.InvalidBudget.selector);
        jobs.setBudget(id, MAX_BUDGET + 1, "");
        jobs.setBudget(id, MAX_BUDGET, "");
        vm.stopPrank();
        assertEq(jobs.getJob(id).budget, MAX_BUDGET);
    }

    // ───────────── fund ─────────────

    function test_Fund_WithoutProviderReverts() public {
        uint256 id = _createNoProvider();
        vm.startPrank(client);
        jobs.setBudget(id, BUDGET, "");
        vm.expectRevert(PayOnProofJobs.ProviderNotSet.selector);
        jobs.fund(id, BUDGET, "");
        vm.stopPrank();
    }

    function test_Fund_ZeroBudgetReverts() public {
        uint256 id = _create();
        vm.prank(client);
        vm.expectRevert(PayOnProofJobs.InvalidBudget.selector);
        jobs.fund(id, 0, "");
    }

    function test_Fund_ExpectedBudgetMismatchReverts() public {
        uint256 id = _open();
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(PayOnProofJobs.BudgetMismatch.selector, BUDGET + 1, BUDGET));
        jobs.fund(id, BUDGET + 1, "");
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(PayOnProofJobs.BudgetMismatch.selector, BUDGET - 1, BUDGET));
        jobs.fund(id, BUDGET - 1, "");
        assertEq(jobs.totalEscrowed(), 0);
    }

    function test_Fund_FrontRunBudgetChangeIsBlockedByExpectedBudget() public {
        uint256 id = _open();
        vm.prank(provider);
        jobs.setBudget(id, MAX_BUDGET, ""); // provider raises budget after client's intent
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(PayOnProofJobs.BudgetMismatch.selector, BUDGET, MAX_BUDGET));
        jobs.fund(id, BUDGET, "");
    }

    function test_Fund_WithoutAllowanceRevertsAndLeavesStateOpen() public {
        vm.prank(client);
        usdc.approve(address(jobs), 0);
        uint256 id = _open();
        vm.prank(client);
        vm.expectRevert();
        jobs.fund(id, BUDGET, "");
        assertEq(uint8(_status(id)), uint8(PayOnProofJobs.Status.Open));
        assertEq(jobs.totalEscrowed(), 0);
        assertEq(usdc.balanceOf(address(jobs)), 0);
    }

    function test_Fund_InsufficientBalanceRevertsAndLeavesStateOpen() public {
        address poor = makeAddr("poor");
        vm.prank(poor);
        usdc.approve(address(jobs), type(uint256).max);
        vm.startPrank(poor);
        uint256 id = jobs.createJob(provider, evaluator, block.timestamp + TTL, "x", address(0));
        jobs.setBudget(id, BUDGET, "");
        vm.expectRevert();
        jobs.fund(id, BUDGET, "");
        vm.stopPrank();
        assertEq(uint8(_status(id)), uint8(PayOnProofJobs.Status.Open));
        assertEq(jobs.totalEscrowed(), 0);
    }

    // ───────────── submit ─────────────

    function test_Submit_ZeroDeliverableReverts() public {
        uint256 id = _funded();
        vm.prank(provider);
        vm.expectRevert(PayOnProofJobs.InvalidDeliverable.selector);
        jobs.submit(id, bytes32(0), "");
        assertEq(uint8(_status(id)), uint8(PayOnProofJobs.Status.Funded));
    }

    // ───────────── nonexistent job ids ─────────────

    function _assertAllNotFound(uint256 id) internal {
        bytes memory err = abi.encodeWithSelector(PayOnProofJobs.JobNotFound.selector, id);
        vm.expectRevert(err);
        jobs.getJob(id);
        vm.expectRevert(err);
        jobs.deliverableOf(id);
        vm.startPrank(client);
        vm.expectRevert(err);
        jobs.setProvider(id, provider);
        vm.expectRevert(err);
        jobs.setBudget(id, BUDGET, "");
        vm.expectRevert(err);
        jobs.fund(id, BUDGET, "");
        vm.expectRevert(err);
        jobs.submit(id, DELIVERABLE, "");
        vm.expectRevert(err);
        jobs.complete(id, 0, "");
        vm.expectRevert(err);
        jobs.reject(id, 0, "");
        vm.expectRevert(err);
        jobs.claimRefund(id);
        vm.stopPrank();
    }

    function test_NonexistentJob_IdZeroReverts() public {
        _assertAllNotFound(0);
        _create();
        _assertAllNotFound(0);
    }

    function test_NonexistentJob_UnallocatedIdReverts() public {
        _assertAllNotFound(1);
        _create();
        _assertAllNotFound(2);
        _assertAllNotFound(type(uint256).max);
    }

    // ───────────── Fuzz ─────────────

    function testFuzz_Budget_FullLifecyclePaysExactBudget(uint256 amount) public {
        amount = bound(amount, 1, MAX_BUDGET);
        uint256 id = _create();
        vm.prank(client);
        jobs.setBudget(id, amount, "");
        uint256 clientBefore = usdc.balanceOf(client);
        vm.prank(client);
        jobs.fund(id, amount, "");
        assertEq(usdc.balanceOf(address(jobs)), amount);
        assertEq(jobs.totalEscrowed(), amount);
        vm.prank(provider);
        jobs.submit(id, DELIVERABLE, "");
        vm.prank(evaluator);
        jobs.complete(id, 0, "");

        assertEq(usdc.balanceOf(provider), amount);
        assertEq(usdc.balanceOf(client), clientBefore - amount);
        assertEq(usdc.balanceOf(address(jobs)), 0);
        assertEq(jobs.totalEscrowed(), 0);
    }

    function testFuzz_Budget_RefundReturnsExactBudget(uint256 amount, bool viaReject, bool submitFirst) public {
        amount = bound(amount, 1, MAX_BUDGET);
        uint256 id = _create();
        vm.prank(client);
        jobs.setBudget(id, amount, "");
        uint256 clientBefore = usdc.balanceOf(client);
        vm.prank(client);
        jobs.fund(id, amount, "");
        if (submitFirst) {
            vm.prank(provider);
            jobs.submit(id, DELIVERABLE, "");
        }
        if (viaReject) {
            vm.prank(evaluator);
            jobs.reject(id, 0, "");
        } else {
            vm.warp(_expiry(id));
            vm.prank(stranger);
            jobs.claimRefund(id);
        }
        assertEq(usdc.balanceOf(client), clientBefore);
        assertEq(usdc.balanceOf(provider), 0);
        assertEq(usdc.balanceOf(address(jobs)), 0);
        assertEq(jobs.totalEscrowed(), 0);
    }

    function testFuzz_SetBudget_AboveMaxReverts(uint256 amount) public {
        amount = bound(amount, MAX_BUDGET + 1, type(uint256).max);
        uint256 id = _create();
        vm.prank(client);
        vm.expectRevert(PayOnProofJobs.InvalidBudget.selector);
        jobs.setBudget(id, amount, "");
    }

    function testFuzz_Fund_ExpectedBudgetMustMatch(uint256 budget, uint256 expected) public {
        budget = bound(budget, 1, MAX_BUDGET);
        vm.assume(expected != budget);
        uint256 id = _create();
        vm.prank(client);
        jobs.setBudget(id, budget, "");
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(PayOnProofJobs.BudgetMismatch.selector, expected, budget));
        jobs.fund(id, expected, "");
    }

    function testFuzz_Create_ExpiryBoundary(uint256 delta) public {
        delta = bound(delta, 0, 365 days);
        vm.prank(client);
        if (delta < 5 minutes) vm.expectRevert(PayOnProofJobs.InvalidExpiry.selector);
        jobs.createJob(provider, evaluator, block.timestamp + delta, "x", address(0));
    }

    function testFuzz_Create_DescriptionLengthBoundary(uint256 len) public {
        len = bound(len, 0, 600);
        vm.prank(client);
        if (len > 280) vm.expectRevert(PayOnProofJobs.DescriptionTooLong.selector);
        jobs.createJob(provider, evaluator, block.timestamp + TTL, _str(len), address(0));
    }

    function testFuzz_ClaimRefund_TimeBoundary(uint256 offset) public {
        offset = bound(offset, 0, 2 * TTL);
        uint256 id = _funded();
        uint256 exp = _expiry(id);
        vm.warp(exp - TTL + offset);
        if (block.timestamp < exp) vm.expectRevert(PayOnProofJobs.JobNotExpired.selector);
        jobs.claimRefund(id);
    }
}
