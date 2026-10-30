import { cx } from '@/lib/cx'
import { useRef, useState } from 'react'
import { keccak256, toBytes, type Hex } from 'viem'
import { FileUp, Type } from 'lucide-react'
import { inputClass } from './ui'

/**
 * Text or file input that computes keccak256 of the raw bytes in the browser.
 * Nothing is uploaded: files are read locally with FileReader / arrayBuffer.
 */
export function HashInput({ onHash, idPrefix }: { onHash: (hash: Hex | null) => void; idPrefix: string }) {
  const [mode, setMode] = useState<'text' | 'file'>('text')
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [hash, setHash] = useState<Hex | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const update = (h: Hex | null) => {
    setHash(h)
    onHash(h)
  }

  const switchMode = (m: 'text' | 'file') => {
    setMode(m)
    setText('')
    setFileName(null)
    if (fileRef.current) fileRef.current.value = ''
    update(null)
  }

  const onText = (value: string) => {
    setText(value)
    update(value.length > 0 ? keccak256(toBytes(value)) : null)
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return update(null)
    setBusy(true)
    setFileName(`${file.name} (${file.size.toLocaleString()} bytes)`)
    try {
      update(keccak256(new Uint8Array(await file.arrayBuffer())))
    } catch {
      update(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="inline-flex rounded-lg bg-surface p-0.5" role="tablist">
        {(['text', 'file'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            className={cx(
              'inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-sm font-medium',
              mode === m ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink',
            )}
          >
            {m === 'text' ? <Type className="size-3.5" aria-hidden /> : <FileUp className="size-3.5" aria-hidden />}
            {m === 'text' ? 'Paste text' : 'Choose file'}
          </button>
        ))}
      </div>
      {mode === 'text' ? (
        <textarea
          id={`${idPrefix}-text`}
          className={cx(inputClass, 'min-h-24 py-2')}
          placeholder="Paste the deliverable text"
          value={text}
          onChange={(e) => onText(e.target.value)}
        />
      ) : (
        <div>
          <input
            ref={fileRef}
            id={`${idPrefix}-file`}
            type="file"
            onChange={(e) => void onFile(e.target.files?.[0])}
            className="block w-full text-sm text-muted file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-surface file:px-3 file:text-sm file:font-semibold file:text-ink"
          />
          {fileName && <p className="mt-1 break-all text-xs text-muted">{fileName}</p>}
        </div>
      )}
      <p className="text-xs text-subtle">The hash is computed in your browser. The content never leaves it.</p>
      <div className="rounded-xl bg-surface px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">keccak256</p>
        <p className="mono break-all text-xs text-ink">{busy ? 'Hashing…' : (hash ?? 'Waiting for content')}</p>
      </div>
    </div>
  )
}
