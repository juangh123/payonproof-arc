// The ABI comes from the committed forge export (src/generated), regenerated with
// `forge build && bun run export-artifact`.
export { jobsAbi, jobsBytecode, jobsBytecodeHash } from '@/generated/PayOnProofJobs'

export type EventName =
  | 'JobCreated'
  | 'ProviderSet'
  | 'BudgetSet'
  | 'JobFunded'
  | 'JobSubmitted'
  | 'JobCompleted'
  | 'JobRejected'
  | 'JobExpired'
  | 'PaymentReleased'
  | 'Refunded'
