// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PayOnProofJobs} from "../PayOnProofJobs.sol";
import {PayOnProofJobsTestBase} from "./PayOnProofJobs.Base.t.sol";

/// @dev Deployment, happy path, reject/refund flows, access control.
contract PayOnProofJobsTest is PayOnProofJobsTestBase {
    // ───────────── Deployment ─────────────

    function test_Deploy_StoresImmutablesAndStartsEmpty() public view {
        assertEq(address(jobs.paymentToken()), address(usdc));
        assertEq(jobs.maxBudget(), MAX_BUDGET);
        assertEq(jobs.jobCount(), 0);
        assertEq(jobs.totalEscrowed(), 0);
    }

    function test_Deploy_RevertsOnZeroToken() public {
        vm.expectRevert(PayOnProofJobs.ZeroPaymentToken.selector);
        new PayOnProofJobs(address(0), MAX_BUDGET);
    }

    function test_Deploy_RevertsOnZeroMaxBudget() public {
        vm.expectRevert(PayOnProofJobs.ZeroMaxBudget.selector);
        new PayOnProofJobs(address(usdc), 0);
    }

    // ───────────── createJob / setProvider / setBudget happy paths ─────────────

    function test_CreateJob_StoresRecordAndEmits() public {
        uint256 exp = block.timestamp + TTL;
        vm.expectEmit(true, true, true, true, address(jobs));
        emit PayOnProofJobs.JobCreated(1, client, provider, evaluator, exp, address(0));
        vm.prank(client);
        uint256 id = jobs.createJob(provider, evaluator, exp, "build a thing", address(0));

        assertEq(id, 1);
        assertEq(jobs.jobCount(), 1);
        PayOnProofJobs.Job memory j = jobs.getJob(id);
        assertEq(j.id, 1);
        assertEq(j.client, client);
        assertEq(j.provider, provider);
        assertEq(j.evaluator, evaluator);
        assertEq(j.description, "build a thing");
        assertEq(j.budget, 0);
        assertEq(j.expiredAt, exp);
        assertEq(uint8(j.status), uint8(PayOnProofJobs.Status.Open));
        assertEq(j.hook, address(0));
        assertEq(jobs.deliverableOf(id), bytes32(0));
    }

    function test_CreateJob_IdsAreSequential() public {
        assertEq(_create(), 1);
        assertEq(_create(), 2);
        assertEq(_create(), 3);
        assertEq(jobs.jobCount(), 3);
    }

    function test_CreateJob_AllowsZeroProviderAndClientAsEvaluator() public {
        vm.prank(client);
        uint256 id = jobs.createJob(address(0), client, block.timestamp + TTL, "", address(0));
        PayOnProofJobs.Job memory j = jobs.getJob(id);
        assertEq(j.provider, address(0));
        assertEq(j.evaluator, client);
    }

    function test_SetProvider_AssignsAndEmits() public {
        vm.prank(client);
        uint256 id = jobs.createJob(address(0), evaluator, block.timestamp + TTL, "x", address(0));

        vm.expectEmit(true, true, false, false, address(jobs));
        emit PayOnProofJobs.ProviderSet(id, provider);
        vm.prank(client);
        jobs.setProvider(id, provider);
        assertEq(jobs.getJob(id).provider, provider);
    }

    function test_SetBudget_ByClientAndProviderEmitsAndOverwrites() public {
        uint256 id = _create();

        vm.expectEmit(true, false, false, true, address(jobs));
        emit PayOnProofJobs.BudgetSet(id, 5e6);
        vm.prank(client);
        jobs.setBudget(id, 5e6, "");
        assertEq(jobs.getJob(id).budget, 5e6);

        vm.expectEmit(true, false, false, true, address(jobs));
        emit PayOnProofJobs.BudgetSet(id, 7e6);
        vm.prank(provider);
        jobs.setBudget(id, 7e6, hex"1234");
        assertEq(jobs.getJob(id).budget, 7e6);
    }

    // ───────────── Full happy path ─────────────

    function test_HappyPath_CreateBudgetFundSubmitComplete() public {
        uint256 clientStart = usdc.balanceOf(client);
        uint256 id = _create();
        vm.prank(provider);
        jobs.setBudget(id, BUDGET, "");

        // fund
        vm.expectEmit(true, true, false, true, address(jobs));
        emit PayOnProofJobs.JobFunded(id, client, BUDGET);
        vm.prank(client);
        jobs.fund(id, BUDGET, "");
        assertEq(uint8(_status(id)), uint8(PayOnProofJobs.Status.Funded));
        assertEq(usdc.balanceOf(address(jobs)), BUDGET);
        assertEq(jobs.totalEscrowed(), BUDGET);
        assertEq(usdc.balanceOf(client), clientStart - BUDGET);

        // submit
        vm.expectEmit(true, true, false, true, address(jobs));
        emit PayOnProofJobs.JobSubmitted(id, provider, DELIVERABLE);
        vm.prank(provider);
        jobs.submit(id, DELIVERABLE, "");
        assertEq(uint8(_status(id)), uint8(PayOnProofJobs.Status.Submitted));
        assertEq(jobs.deliverableOf(id), DELIVERABLE);
        assertEq(jobs.totalEscrowed(), BUDGET);

        // complete
        uint256 providerBefore = usdc.balanceOf(provider);
        vm.expectEmit(true, true, false, true, address(jobs));
        emit PayOnProofJobs.JobCompleted(id, evaluator, REASON);
        vm.expectEmit(true, true, false, true, address(jobs));
        emit PayOnProofJobs.PaymentReleased(id, provider, BUDGET);
        vm.prank(evaluator);
        jobs.complete(id, REASON, "");

        assertEq(uint8(_status(id)), uint8(PayOnProofJobs.Status.Completed));
        assertEq(usdc.balanceOf(provider), providerBefore + BUDGET);
        assertEq(usdc.balanceOf(address(jobs)), 0);
        assertEq(jobs.totalEscrowed(), 0);
        assertEq(usdc.balanceOf(client), clientStart - BUDGET);
    }

    function test_HappyPath_ClientIsEvaluatorCanComplete() public {
        vm.prank(client);
        uint256 id = jobs.createJob(provider, client, block.timestamp + TTL, "x", address(0));
        vm.startPrank(client);
        jobs.setBudget(id, BUDGET, "");
        jobs.fund(id, BUDGET, "");
        vm.stopPrank();
        vm.prank(provider);
        jobs.submit(id, DELIVERABLE, "");
        vm.prank(client);
        jobs.complete(id, 0, "");
        assertEq(usdc.balanceOf(provider), BUDGET);
        assertEq(jobs.totalEscrowed(), 0);
    }

    // ───────────── Reject ─────────────

    function test_Reject_EvaluatorWhileSubmittedRefundsClient() public {
        uint256 id = _submitted();
        uint256 clientBefore = usdc.balanceOf(client);

        vm.expectEmit(true, true, false, true, address(jobs));
        emit PayOnProofJobs.JobRejected(id, evaluator, REASON);
        vm.expectEmit(true, true, false, true, address(jobs));
        emit PayOnProofJobs.Refunded(id, client, BUDGET);
        vm.prank(evaluator);
        jobs.reject(id, REASON, "");

        assertEq(uint8(_status(id)), uint8(PayOnProofJobs.Status.Rejected));
        assertEq(usdc.balanceOf(client), clientBefore + BUDGET);
        assertEq(usdc.balanceOf(provider), 0);
        assertEq(usdc.balanceOf(address(jobs)), 0);
        assertEq(jobs.totalEscrowed(), 0);
    }

    function test_Reject_EvaluatorWhileFundedRefundsClient() public {
        uint256 id = _funded();
        uint256 clientBefore = usdc.balanceOf(client);

        vm.expectEmit(true, true, false, true, address(jobs));
        emit PayOnProofJobs.JobRejected(id, evaluator, REASON);
        vm.prank(evaluator);
        jobs.reject(id, REASON, "");

        assertEq(uint8(_status(id)), uint8(PayOnProofJobs.Status.Rejected));
        assertEq(usdc.balanceOf(client), clientBefore + BUDGET);
        assertEq(usdc.balanceOf(address(jobs)), 0);
        assertEq(jobs.totalEscrowed(), 0);
    }

    function test_Reject_ClientWhileOpenMovesNoFunds() public {
        uint256 id = _open();
        uint256 clientBefore = usdc.balanceOf(client);

        vm.expectEmit(true, true, false, true, address(jobs));
        emit PayOnProofJobs.JobRejected(id, client, REASON);
        vm.prank(client);
        jobs.reject(id, REASON, "");

        assertEq(uint8(_status(id)), uint8(PayOnProofJobs.Status.Rejected));
        assertEq(usdc.balanceOf(client), clientBefore);
        assertEq(usdc.balanceOf(address(jobs)), 0);
        assertEq(jobs.totalEscrowed(), 0);
    }

    function test_Reject_OpenByNonClientReverts() public {
        uint256 id = _open();
        address[3] memory callers = [evaluator, provider, stranger];
        for (uint256 i; i < callers.length; ++i) {
            vm.prank(callers[i]);
            vm.expectRevert(PayOnProofJobs.Unauthorized.selector);
            jobs.reject(id, 0, "");
        }
    }

    function test_Reject_EscrowedByNonEvaluatorReverts() public {
        uint256 id = _funded();
        address[3] memory callers = [client, provider, stranger];
        for (uint256 i; i < callers.length; ++i) {
            vm.prank(callers[i]);
            vm.expectRevert(PayOnProofJobs.Unauthorized.selector);
            jobs.reject(id, 0, "");
        }
        uint256 id2 = _submitted();
        vm.prank(client);
        vm.expectRevert(PayOnProofJobs.Unauthorized.selector);
        jobs.reject(id2, 0, "");
    }

    // ───────────── claimRefund ─────────────

    function test_ClaimRefund_FundedAfterExpiryByThirdParty() public {
        uint256 id = _funded();
        uint256 clientBefore = usdc.balanceOf(client);
        vm.warp(_expiry(id));

        vm.expectEmit(true, false, false, false, address(jobs));
        emit PayOnProofJobs.JobExpired(id);
        vm.expectEmit(true, true, false, true, address(jobs));
        emit PayOnProofJobs.Refunded(id, client, BUDGET);
        vm.prank(stranger);
        jobs.claimRefund(id);

        assertEq(uint8(_status(id)), uint8(PayOnProofJobs.Status.Expired));
        assertEq(usdc.balanceOf(client), clientBefore + BUDGET);
        assertEq(usdc.balanceOf(stranger), 0);
        assertEq(usdc.balanceOf(address(jobs)), 0);
        assertEq(jobs.totalEscrowed(), 0);
    }

    function test_ClaimRefund_SubmittedAfterExpiryByThirdParty() public {
        uint256 id = _submitted();
        uint256 clientBefore = usdc.balanceOf(client);
        vm.warp(_expiry(id) + 1 days);

        vm.prank(stranger);
        jobs.claimRefund(id);

        assertEq(uint8(_status(id)), uint8(PayOnProofJobs.Status.Expired));
        assertEq(usdc.balanceOf(client), clientBefore + BUDGET);
        assertEq(usdc.balanceOf(provider), 0);
        assertEq(jobs.totalEscrowed(), 0);
    }

    function test_ClaimRefund_RevertsBeforeExpiry() public {
        uint256 id = _funded();
        vm.prank(stranger);
        vm.expectRevert(PayOnProofJobs.JobNotExpired.selector);
        jobs.claimRefund(id);

        vm.warp(_expiry(id) - 1);
        vm.prank(stranger);
        vm.expectRevert(PayOnProofJobs.JobNotExpired.selector);
        jobs.claimRefund(id);

        uint256 id2 = _submitted();
        vm.prank(stranger);
        vm.expectRevert(PayOnProofJobs.JobNotExpired.selector);
        jobs.claimRefund(id2);
    }

    function test_ClaimRefund_OpenJobReverts() public {
        uint256 id = _open();
        vm.warp(_expiry(id) + 1);
        vm.expectRevert(_invalidStatus(PayOnProofJobs.Status.Open));
        jobs.claimRefund(id);
    }

    // ───────────── Access control ─────────────

    function test_Access_OnlyClientCanSetProvider() public {
        vm.prank(client);
        uint256 id = jobs.createJob(address(0), evaluator, block.timestamp + TTL, "x", address(0));
        address[3] memory callers = [provider, evaluator, stranger];
        for (uint256 i; i < callers.length; ++i) {
            vm.prank(callers[i]);
            vm.expectRevert(PayOnProofJobs.Unauthorized.selector);
            jobs.setProvider(id, provider);
        }
    }

    function test_Access_OnlyClientOrProviderCanSetBudget() public {
        uint256 id = _create();
        address[2] memory callers = [evaluator, stranger];
        for (uint256 i; i < callers.length; ++i) {
            vm.prank(callers[i]);
            vm.expectRevert(PayOnProofJobs.Unauthorized.selector);
            jobs.setBudget(id, BUDGET, "");
        }
    }

    function test_Access_OnlyClientCanFund() public {
        uint256 id = _open();
        usdc.mint(provider, BUDGET);
        usdc.mint(stranger, BUDGET);
        address[3] memory callers = [provider, evaluator, stranger];
        for (uint256 i; i < callers.length; ++i) {
            vm.prank(callers[i]);
            vm.expectRevert(PayOnProofJobs.Unauthorized.selector);
            jobs.fund(id, BUDGET, "");
        }
    }

    function test_Access_OnlyProviderCanSubmit() public {
        uint256 id = _funded();
        address[3] memory callers = [client, evaluator, stranger];
        for (uint256 i; i < callers.length; ++i) {
            vm.prank(callers[i]);
            vm.expectRevert(PayOnProofJobs.Unauthorized.selector);
            jobs.submit(id, DELIVERABLE, "");
        }
    }

    function test_Access_OnlyEvaluatorCanComplete() public {
        uint256 id = _submitted();
        address[3] memory callers = [client, provider, stranger];
        for (uint256 i; i < callers.length; ++i) {
            vm.prank(callers[i]);
            vm.expectRevert(PayOnProofJobs.Unauthorized.selector);
            jobs.complete(id, 0, "");
        }
        assertEq(uint8(_status(id)), uint8(PayOnProofJobs.Status.Submitted));
    }

    function test_Access_ProviderCannotCompleteOwnJob_FundsStay() public {
        uint256 id = _submitted();
        vm.prank(provider);
        vm.expectRevert(PayOnProofJobs.Unauthorized.selector);
        jobs.complete(id, 0, "");
        assertEq(usdc.balanceOf(provider), 0);
        assertEq(usdc.balanceOf(address(jobs)), BUDGET);
    }
}
