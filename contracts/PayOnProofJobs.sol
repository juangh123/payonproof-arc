// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PayOnProofJobs
 * @notice Hook-free, fee-free ERC-8183-style job escrow using the USDC ERC-20 interface.
 * @dev Intended for Arc testnet and then Arc mainnet with paymentToken set to
 * 0x3600000000000000000000000000000000000000. All amounts use USDC's six decimals;
 * native Arc balances are not used. The constructor accepts a token address rather
 * than enforcing a particular chain or token. Only a non-fee-on-transfer USDC token
 * is supported. A deliverable is a provider-supplied keccak256 hash, not an on-chain
 * verification of the underlying work; the evaluator decides acceptance.
 * Completion and evaluator rejection remain available after expiry until a refund
 * is claimed. The first valid settlement wins. Refund eligibility does not bypass
 * token-level transfer restrictions or token outages.
 * No owner, administrative withdrawals, fees, hooks, pause or upgrade mechanism exists.
 */
contract PayOnProofJobs is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The lifecycle states, in their ABI ordinal order.
    enum Status { Open, Funded, Submitted, Completed, Rejected, Expired }

    /**
     * @notice A job's participants, terms and lifecycle state.
     * @param id Sequential identifier starting at one.
     * @param client Creator and funding party.
     * @param provider Delivering party; may be zero only before assignment.
     * @param evaluator Settlement authority; may equal the client.
     * @param description Job description, at most 280 bytes.
     * @param budget Payment in six-decimal USDC units; initially zero.
     * @param expiredAt Unix timestamp at which a funded job becomes refundable.
     * @param status Current lifecycle state.
     * @param hook Always zero because hooks are unsupported.
     */
    struct Job {
        uint256 id;
        address client;
        address provider;
        address evaluator;
        string description;
        uint256 budget;
        uint256 expiredAt;
        Status status;
        address hook;
    }

    /// @notice Immutable ERC-20 USDC payment interface (six decimals on Arc).
    IERC20 public immutable paymentToken;
    /// @notice Immutable maximum budget for one job, in six-decimal USDC units.
    uint256 public immutable maxBudget;

    /// @dev Job records keyed by their nonzero identifiers.
    mapping(uint256 => Job) private _jobs;
    /// @dev Deliverable hashes stored separately from job records.
    mapping(uint256 => bytes32) private _deliverables;
    /// @dev Number of created jobs, also the last assigned identifier.
    uint256 private _jobCount;
    /// @dev Sum of budgets of all Funded and Submitted jobs.
    uint256 private _totalEscrowed;

    /// @notice The constructor received a zero payment token address.
    error ZeroPaymentToken();
    /// @notice The constructor received a zero maximum budget.
    error ZeroMaxBudget();
    /// @notice No job exists with the supplied identifier.
    /// @param jobId The nonexistent identifier.
    error JobNotFound(uint256 jobId);
    /// @notice The caller lacks the role required for this action and state.
    error Unauthorized();
    /// @notice The job is not in a state that permits this action.
    /// @param actual The current state.
    error InvalidStatus(Status actual);
    /// @notice The evaluator must be nonzero.
    error InvalidEvaluator();
    /// @notice The provider must be nonzero and distinct from client and evaluator.
    error InvalidProvider();
    /// @notice A provider has already been assigned.
    error ProviderAlreadySet();
    /// @notice Funding requires an assigned provider.
    error ProviderNotSet();
    /// @notice Expiry must be at least five minutes after job creation.
    error InvalidExpiry();
    /// @notice Nonzero hooks are unsupported.
    error HooksUnsupported();
    /// @notice The description exceeds 280 bytes.
    error DescriptionTooLong();
    /// @notice The budget must be greater than zero and no greater than maxBudget.
    error InvalidBudget();
    /// @notice The current budget differs from the client's expected budget.
    /// @param expected The budget authorized by the client.
    /// @param actual The budget currently stored for the job.
    error BudgetMismatch(uint256 expected, uint256 actual);
    /// @notice Funding and submission are unavailable at or after expiry.
    error JobPastExpiry();
    /// @notice A refund cannot be claimed before expiry.
    error JobNotExpired();
    /// @notice A submitted deliverable hash must be nonzero.
    error InvalidDeliverable();

    /// @notice Emitted when a client creates a job.
    /// @param jobId Assigned identifier.
    /// @param client Job creator.
    /// @param provider Initial provider, possibly zero.
    /// @param evaluator Settlement authority.
    /// @param expiredAt Refund eligibility timestamp.
    /// @param hook Always zero.
    event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook);
    /// @notice Emitted when the client assigns a previously unset provider.
    /// @param jobId Job identifier.
    /// @param provider Assigned provider.
    event ProviderSet(uint256 indexed jobId, address indexed provider);
    /// @notice Emitted when the client or provider sets an Open job's budget.
    /// @param jobId Job identifier.
    /// @param amount Budget in USDC base units.
    event BudgetSet(uint256 indexed jobId, uint256 amount);
    /// @notice Emitted when a client funds a job.
    /// @param jobId Job identifier.
    /// @param client Funding client.
    /// @param amount Escrowed USDC base units.
    event JobFunded(uint256 indexed jobId, address indexed client, uint256 amount);
    /// @notice Emitted when a provider submits a deliverable hash.
    /// @param jobId Job identifier.
    /// @param provider Submitting provider.
    /// @param deliverable Provider-supplied keccak256 hash of the deliverable.
    event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable);
    /// @notice Emitted when the evaluator completes a job.
    /// @param jobId Job identifier.
    /// @param evaluator Completing evaluator.
    /// @param reason Evaluator-supplied reason or reference, possibly zero.
    event JobCompleted(uint256 indexed jobId, address indexed evaluator, bytes32 reason);
    /// @notice Emitted when an authorized participant rejects a job.
    /// @param jobId Job identifier.
    /// @param rejector Client for Open jobs; evaluator for escrowed jobs.
    /// @param reason Caller-supplied reason or reference, possibly zero.
    event JobRejected(uint256 indexed jobId, address indexed rejector, bytes32 reason);
    /// @notice Emitted when anyone successfully claims an expired job's refund.
    /// @param jobId Job identifier.
    event JobExpired(uint256 indexed jobId);
    /// @notice Emitted alongside JobCompleted for a provider payout.
    /// @param jobId Job identifier.
    /// @param provider Payment recipient.
    /// @param amount Released USDC base units.
    event PaymentReleased(uint256 indexed jobId, address indexed provider, uint256 amount);
    /// @notice Emitted alongside JobRejected or JobExpired for an escrow refund.
    /// @param jobId Job identifier.
    /// @param client Refund recipient.
    /// @param amount Refunded USDC base units.
    event Refunded(uint256 indexed jobId, address indexed client, uint256 amount);

    /**
     * @notice Configure the immutable payment token and per-job budget cap.
     * @dev Both arguments must be nonzero. No token-decimal or chain check is performed.
     * @param paymentToken_ Arc USDC ERC-20 address: 0x3600000000000000000000000000000000000000.
     * @param maxBudget_ Maximum budget in six-decimal units; 100000000 represents 100 USDC.
     */
    constructor(address paymentToken_, uint256 maxBudget_) {
        if (paymentToken_ == address(0)) revert ZeroPaymentToken();
        if (maxBudget_ == 0) revert ZeroMaxBudget();
        paymentToken = IERC20(paymentToken_);
        maxBudget = maxBudget_;
    }

    /**
     * @notice Create an unfunded job with the caller as client.
     * @param provider Initial provider, or zero for later assignment; cannot equal client or evaluator.
     * @param evaluator Nonzero settlement authority; may equal the client.
     * @param expiredAt Expiry at least five minutes in the future, inclusive.
     * @param description Description containing at most 280 bytes.
     * @param hook Must be zero; hooks are unsupported.
     * @return jobId Newly allocated identifier starting at one.
     */
    function createJob(address provider, address evaluator, uint256 expiredAt, string calldata description, address hook)
        external returns (uint256 jobId)
    {
        if (evaluator == address(0)) revert InvalidEvaluator();
        if (provider != address(0) && (provider == msg.sender || provider == evaluator)) revert InvalidProvider();
        if (expiredAt < block.timestamp + 5 minutes) revert InvalidExpiry();
        if (hook != address(0)) revert HooksUnsupported();
        if (bytes(description).length > 280) revert DescriptionTooLong();

        jobId = ++_jobCount;
        _jobs[jobId] = Job({
            id: jobId,
            client: msg.sender,
            provider: provider,
            evaluator: evaluator,
            description: description,
            budget: 0,
            expiredAt: expiredAt,
            status: Status.Open,
            hook: address(0)
        });
        emit JobCreated(jobId, msg.sender, provider, evaluator, expiredAt, hook);
    }

    /**
     * @notice Assign the provider once, as the client of an Open job.
     * @param jobId Existing job identifier.
     * @param provider_ Nonzero provider distinct from client and evaluator.
     */
    function setProvider(uint256 jobId, address provider_) external {
        Job storage job = _getJob(jobId);
        if (msg.sender != job.client) revert Unauthorized();
        if (job.status != Status.Open) revert InvalidStatus(job.status);
        if (job.provider != address(0)) revert ProviderAlreadySet();
        if (provider_ == address(0) || provider_ == job.client || provider_ == job.evaluator) revert InvalidProvider();
        job.provider = provider_;
        emit ProviderSet(jobId, provider_);
    }

    /**
     * @notice Set an Open job's budget as its client or assigned provider.
     * @param jobId Existing job identifier.
     * @param amount Nonzero budget not exceeding maxBudget, in USDC base units.
     * @param optParams Accepted for signature compatibility and ignored.
     */
    function setBudget(uint256 jobId, uint256 amount, bytes calldata optParams) external {
        Job storage job = _getJob(jobId);
        if (msg.sender != job.client && msg.sender != job.provider) revert Unauthorized();
        if (job.status != Status.Open) revert InvalidStatus(job.status);
        if (amount == 0 || amount > maxBudget) revert InvalidBudget();
        job.budget = amount;
        emit BudgetSet(jobId, amount);
    }

    /**
     * @notice Fund an Open job as its client before expiry.
     * @dev Requires an assigned provider and prior ERC-20 allowance. State and escrow
     * accounting are updated before transferring tokens; a transfer failure reverts all changes.
     * @param jobId Existing job identifier.
     * @param expectedBudget Client-authorized budget; must equal the current nonzero budget.
     * @param optParams Accepted for signature compatibility and ignored.
     */
    function fund(uint256 jobId, uint256 expectedBudget, bytes calldata optParams) external nonReentrant {
        Job storage job = _getJob(jobId);
        if (msg.sender != job.client) revert Unauthorized();
        if (job.status != Status.Open) revert InvalidStatus(job.status);
        if (job.provider == address(0)) revert ProviderNotSet();
        uint256 amount = job.budget;
        if (amount == 0) revert InvalidBudget();
        if (amount != expectedBudget) revert BudgetMismatch(expectedBudget, amount);
        if (block.timestamp >= job.expiredAt) revert JobPastExpiry();

        job.status = Status.Funded;
        _totalEscrowed += amount;
        // msg.sender == job.client was verified above.
        paymentToken.safeTransferFrom(msg.sender, address(this), amount);
        emit JobFunded(jobId, msg.sender, amount);
    }

    /**
     * @notice Submit a deliverable hash as provider of a Funded job before expiry.
     * @param jobId Existing job identifier.
     * @param deliverable Nonzero keccak256 hash of the deliverable.
     * @param optParams Accepted for signature compatibility and ignored.
     */
    function submit(uint256 jobId, bytes32 deliverable, bytes calldata optParams) external {
        Job storage job = _getJob(jobId);
        if (msg.sender != job.provider) revert Unauthorized();
        if (job.status != Status.Funded) revert InvalidStatus(job.status);
        if (block.timestamp >= job.expiredAt) revert JobPastExpiry();
        if (deliverable == bytes32(0)) revert InvalidDeliverable();
        _deliverables[jobId] = deliverable;
        job.status = Status.Submitted;
        emit JobSubmitted(jobId, msg.sender, deliverable);
    }

    /**
     * @notice Complete a Submitted job as evaluator and release its entire budget.
     * @dev Available even after expiry until another valid settlement succeeds.
     * Status and accounting are finalized before the transfer; first settlement wins.
     * @param jobId Existing job identifier.
     * @param reason Evaluator-supplied reason or reference; may be zero.
     * @param optParams Accepted for signature compatibility and ignored.
     */
    function complete(uint256 jobId, bytes32 reason, bytes calldata optParams) external nonReentrant {
        Job storage job = _getJob(jobId);
        if (msg.sender != job.evaluator) revert Unauthorized();
        if (job.status != Status.Submitted) revert InvalidStatus(job.status);
        uint256 amount = job.budget;
        job.status = Status.Completed;
        _totalEscrowed -= amount;
        paymentToken.safeTransfer(job.provider, amount);
        emit JobCompleted(jobId, msg.sender, reason);
        emit PaymentReleased(jobId, job.provider, amount);
    }

    /**
     * @notice Reject an Open job as client, or a Funded/Submitted job as evaluator.
     * @dev An Open rejection moves no funds. Escrowed jobs refund the full budget.
     * Evaluator rejection remains available after expiry until another settlement wins.
     * Client and evaluator may be the same address; authorization is state-dependent.
     * @param jobId Existing job identifier.
     * @param reason Caller-supplied reason or reference; may be zero.
     * @param optParams Accepted for signature compatibility and ignored.
     */
    function reject(uint256 jobId, bytes32 reason, bytes calldata optParams) external nonReentrant {
        Job storage job = _getJob(jobId);
        if (job.status == Status.Open) {
            if (msg.sender != job.client) revert Unauthorized();
            job.status = Status.Rejected;
            emit JobRejected(jobId, msg.sender, reason);
        } else {
            if (job.status != Status.Funded && job.status != Status.Submitted) revert InvalidStatus(job.status);
            if (msg.sender != job.evaluator) revert Unauthorized();
            uint256 amount = job.budget;
            job.status = Status.Rejected;
            _totalEscrowed -= amount;
            paymentToken.safeTransfer(job.client, amount);
            emit JobRejected(jobId, msg.sender, reason);
            emit Refunded(jobId, job.client, amount);
        }
    }

    /**
     * @notice Refund an unsettled Funded or Submitted job to its client at or after expiry.
     * @dev Anyone may call. Completion or evaluator rejection can still win before
     * this call settles. Status and accounting are finalized before transferring.
     * @param jobId Existing job identifier.
     */
    function claimRefund(uint256 jobId) external nonReentrant {
        Job storage job = _getJob(jobId);
        if (job.status != Status.Funded && job.status != Status.Submitted) revert InvalidStatus(job.status);
        if (block.timestamp < job.expiredAt) revert JobNotExpired();
        uint256 amount = job.budget;
        job.status = Status.Expired;
        _totalEscrowed -= amount;
        paymentToken.safeTransfer(job.client, amount);
        emit JobExpired(jobId);
        emit Refunded(jobId, job.client, amount);
    }

    /**
     * @notice Retrieve a complete job record; nonexistent identifiers revert.
     * @param jobId Existing job identifier.
     * @return job Copy of the stored job record.
     */
    function getJob(uint256 jobId) external view returns (Job memory job) {
        job = _getJob(jobId);
    }

    /**
     * @notice Retrieve a job's submitted hash; nonexistent identifiers revert.
     * @param jobId Existing job identifier.
     * @return deliverable Stored hash, or zero if no deliverable has been submitted.
     */
    function deliverableOf(uint256 jobId) external view returns (bytes32 deliverable) {
        _getJob(jobId);
        return _deliverables[jobId];
    }

    /// @notice Return the total number of created jobs, including terminal jobs.
    /// @return count Number of allocated identifiers.
    function jobCount() external view returns (uint256 count) {
        return _jobCount;
    }

    /// @notice Return outstanding escrow obligations, excluding unsolicited transfers.
    /// @return amount Total budgets of Funded and Submitted jobs in USDC base units.
    function totalEscrowed() external view returns (uint256 amount) {
        return _totalEscrowed;
    }

    /**
     * @dev Look up a job, rejecting zero and all unallocated identifiers.
     * @param jobId Identifier to validate and load.
     * @return job Storage reference to an existing job.
     */
    function _getJob(uint256 jobId) private view returns (Job storage job) {
        job = _jobs[jobId];
        if (job.id == 0) revert JobNotFound(jobId);
    }
}
