// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PayOnProofJobs} from "../PayOnProofJobs.sol";
import {PayOnProofJobsTestBase} from "./PayOnProofJobs.Base.t.sol";

/// @dev Invalid state transitions and post-expiry behaviour.
contract PayOnProofJobsTransitionsTest is PayOnProofJobsTestBase {
    PayOnProofJobs.Status internal constant OPEN = PayOnProofJobs.Status.Open;
    PayOnProofJobs.Status internal constant FUNDED = PayOnProofJobs.Status.Funded;
    PayOnProofJobs.Status internal constant SUBMITTED = PayOnProofJobs.Status.Submitted;
    PayOnProofJobs.Status internal constant COMPLETED = PayOnProofJobs.Status.Completed;
    PayOnProofJobs.Status internal constant REJECTED = PayOnProofJobs.Status.Rejected;
    PayOnProofJobs.Status internal constant EXPIRED = PayOnProofJobs.Status.Expired;

    function test_CompleteTwiceReverts_PaidOnce() public {
        uint256 id = _submitted();
        vm.prank(evaluator);
        jobs.complete(id, 0, "");
        vm.prank(evaluator);
        vm.expectRevert(_invalidStatus(COMPLETED));
        jobs.complete(id, 0, "");
        assertEq(usdc.balanceOf(provider), BUDGET);
    }

    function test_CompleteAfterRefundReverts() public {
        uint256 id = _submitted();
        vm.warp(_expiry(id));
        jobs.claimRefund(id);
        vm.prank(evaluator);
        vm.expectRevert(_invalidStatus(EXPIRED));
        jobs.complete(id, 0, "");
        assertEq(usdc.balanceOf(provider), 0);
    }

    function test_CompleteAfterEvaluatorRejectReverts() public {
        uint256 id = _submitted();
        vm.prank(evaluator);
        jobs.reject(id, 0, "");
        vm.prank(evaluator);
        vm.expectRevert(_invalidStatus(REJECTED));
        jobs.complete(id, 0, "");
    }

    function test_RefundAfterCompleteReverts() public {
        uint256 id = _submitted();
        vm.prank(evaluator);
        jobs.complete(id, 0, "");
        vm.warp(_expiry(id) + 1);
        vm.expectRevert(_invalidStatus(COMPLETED));
        jobs.claimRefund(id);
        assertEq(usdc.balanceOf(provider), BUDGET);
    }

    function test_RefundTwiceReverts() public {
        uint256 id = _funded();
        vm.warp(_expiry(id));
        jobs.claimRefund(id);
        vm.expectRevert(_invalidStatus(EXPIRED));
        jobs.claimRefund(id);
    }

    function test_RefundAfterEvaluatorRejectReverts() public {
        uint256 id = _funded();
        vm.prank(evaluator);
        jobs.reject(id, 0, "");
        vm.warp(_expiry(id));
        vm.expectRevert(_invalidStatus(REJECTED));
        jobs.claimRefund(id);
    }

    function test_RejectAfterCompleteReverts() public {
        uint256 id = _submitted();
        vm.prank(evaluator);
        jobs.complete(id, 0, "");
        vm.prank(evaluator);
        vm.expectRevert(_invalidStatus(COMPLETED));
        jobs.reject(id, 0, "");
    }

    function test_RejectAfterRefundReverts() public {
        uint256 id = _funded();
        vm.warp(_expiry(id));
        jobs.claimRefund(id);
        vm.prank(evaluator);
        vm.expectRevert(_invalidStatus(EXPIRED));
        jobs.reject(id, 0, "");
    }

    function test_RejectTwiceReverts() public {
        uint256 id = _open();
        vm.prank(client);
        jobs.reject(id, 0, "");
        vm.prank(client);
        vm.expectRevert(_invalidStatus(REJECTED));
        jobs.reject(id, 0, "");
    }

    function test_FundTwiceReverts() public {
        uint256 id = _funded();
        vm.prank(client);
        vm.expectRevert(_invalidStatus(FUNDED));
        jobs.fund(id, BUDGET, "");
        assertEq(usdc.balanceOf(address(jobs)), BUDGET);
        assertEq(jobs.totalEscrowed(), BUDGET);
    }

    function test_FundAfterExpiryReverts() public {
        uint256 id = _open();
        vm.warp(_expiry(id));
        vm.prank(client);
        vm.expectRevert(PayOnProofJobs.JobPastExpiry.selector);
        jobs.fund(id, BUDGET, "");

        vm.warp(_expiry(id) + 1 days);
        vm.prank(client);
        vm.expectRevert(PayOnProofJobs.JobPastExpiry.selector);
        jobs.fund(id, BUDGET, "");
        assertEq(jobs.totalEscrowed(), 0);
    }

    function test_FundJustBeforeExpirySucceeds() public {
        uint256 id = _open();
        vm.warp(_expiry(id) - 1);
        vm.prank(client);
        jobs.fund(id, BUDGET, "");
        assertEq(uint8(_status(id)), uint8(FUNDED));
    }

    function test_FundRejectedJobReverts() public {
        uint256 id = _open();
        vm.prank(client);
        jobs.reject(id, 0, "");
        vm.prank(client);
        vm.expectRevert(_invalidStatus(REJECTED));
        jobs.fund(id, BUDGET, "");
    }

    function test_SubmitAfterExpiryReverts() public {
        uint256 id = _funded();
        vm.warp(_expiry(id));
        vm.prank(provider);
        vm.expectRevert(PayOnProofJobs.JobPastExpiry.selector);
        jobs.submit(id, DELIVERABLE, "");
        assertEq(uint8(_status(id)), uint8(FUNDED));
    }

    function test_SubmitJustBeforeExpirySucceeds() public {
        uint256 id = _funded();
        vm.warp(_expiry(id) - 1);
        vm.prank(provider);
        jobs.submit(id, DELIVERABLE, "");
        assertEq(uint8(_status(id)), uint8(SUBMITTED));
    }

    function test_SubmitBeforeFundingReverts() public {
        uint256 id = _open();
        vm.prank(provider);
        vm.expectRevert(_invalidStatus(OPEN));
        jobs.submit(id, DELIVERABLE, "");
    }

    function test_SubmitTwiceReverts() public {
        uint256 id = _submitted();
        vm.prank(provider);
        vm.expectRevert(_invalidStatus(SUBMITTED));
        jobs.submit(id, keccak256("other"), "");
        assertEq(jobs.deliverableOf(id), DELIVERABLE);
    }

    function test_CompleteBeforeSubmitReverts() public {
        uint256 id = _funded();
        vm.prank(evaluator);
        vm.expectRevert(_invalidStatus(FUNDED));
        jobs.complete(id, 0, "");
        uint256 id2 = _open();
        vm.prank(evaluator);
        vm.expectRevert(_invalidStatus(OPEN));
        jobs.complete(id2, 0, "");
    }

    function test_SetBudgetAfterFundReverts() public {
        uint256 id = _funded();
        vm.prank(client);
        vm.expectRevert(_invalidStatus(FUNDED));
        jobs.setBudget(id, 1, "");
        vm.prank(provider);
        vm.expectRevert(_invalidStatus(FUNDED));
        jobs.setBudget(id, 1, "");
        assertEq(jobs.getJob(id).budget, BUDGET);
    }

    function test_SetProviderAfterFundReverts() public {
        uint256 id = _funded();
        vm.prank(client);
        vm.expectRevert(_invalidStatus(FUNDED));
        jobs.setProvider(id, makeAddr("other"));
    }

    // ───────────── Settlement still available after expiry ─────────────

    function test_CompleteStillWorksAfterExpiryUntilRefund() public {
        uint256 id = _submitted();
        vm.warp(_expiry(id) + 7 days);
        vm.prank(evaluator);
        jobs.complete(id, REASON, "");
        assertEq(uint8(_status(id)), uint8(COMPLETED));
        assertEq(usdc.balanceOf(provider), BUDGET);
        assertEq(usdc.balanceOf(address(jobs)), 0);
        assertEq(jobs.totalEscrowed(), 0);
    }

    function test_RejectSubmittedStillWorksAfterExpiry() public {
        uint256 id = _submitted();
        uint256 clientBefore = usdc.balanceOf(client);
        vm.warp(_expiry(id) + 7 days);
        vm.prank(evaluator);
        jobs.reject(id, REASON, "");
        assertEq(uint8(_status(id)), uint8(REJECTED));
        assertEq(usdc.balanceOf(client), clientBefore + BUDGET);
        assertEq(jobs.totalEscrowed(), 0);
    }

    function test_RejectFundedStillWorksAfterExpiry() public {
        uint256 id = _funded();
        uint256 clientBefore = usdc.balanceOf(client);
        vm.warp(_expiry(id) + 7 days);
        vm.prank(evaluator);
        jobs.reject(id, REASON, "");
        assertEq(uint8(_status(id)), uint8(REJECTED));
        assertEq(usdc.balanceOf(client), clientBefore + BUDGET);
    }

    function test_ClientRejectOpenStillWorksAfterExpiry() public {
        uint256 id = _open();
        vm.warp(_expiry(id) + 1);
        vm.prank(client);
        jobs.reject(id, 0, "");
        assertEq(uint8(_status(id)), uint8(REJECTED));
    }

    function test_FirstSettlementWins_RefundThenEvaluatorBlocked() public {
        uint256 id = _funded();
        vm.warp(_expiry(id));
        vm.prank(stranger);
        jobs.claimRefund(id);
        vm.prank(evaluator);
        vm.expectRevert(_invalidStatus(EXPIRED));
        jobs.reject(id, 0, "");
        assertEq(usdc.balanceOf(address(jobs)), 0);
    }

    function test_IndependentJobsDoNotInterfere() public {
        uint256 a = _submitted();
        uint256 b = _funded();
        assertEq(jobs.totalEscrowed(), 2 * BUDGET);
        vm.prank(evaluator);
        jobs.complete(a, 0, "");
        assertEq(jobs.totalEscrowed(), BUDGET);
        assertEq(usdc.balanceOf(address(jobs)), BUDGET);
        assertEq(uint8(_status(b)), uint8(FUNDED));
    }
}
