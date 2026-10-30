import { useState } from 'react'
import type { Hex } from 'viem'
import { Card, Notice } from './ui'
import { HashInput } from './HashInput'
import { isZeroHash } from '@/lib/format'

/** Anyone can check whether some content matches the hash the provider submitted onchain. */
export function VerifyDelivery({ deliverable }: { deliverable: Hex | undefined }) {
  const [hash, setHash] = useState<Hex | null>(null)
  const submitted = deliverable !== undefined && !isZeroHash(deliverable)

  return (
    <Card className="space-y-3">
      <h2 className="display text-lg font-semibold">Verify delivery</h2>
      <p className="text-sm text-muted">Paste the delivered text or choose the file. We hash it here and compare it with the hash stored onchain.</p>
      {!submitted ? (
        <Notice>No delivery has been submitted for this job yet.</Notice>
      ) : (
        <>
          <HashInput idPrefix="verify" onHash={setHash} />
          {hash &&
            (hash.toLowerCase() === deliverable.toLowerCase() ? (
              <Notice tone="success">Match. This content is exactly what the provider submitted.</Notice>
            ) : (
              <Notice tone="error">No match. This content is different from the submitted delivery.</Notice>
            ))}
        </>
      )}
    </Card>
  )
}
