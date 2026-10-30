import { useRef, useState } from 'react'
import { Button } from '@sheet/ui/button'
import { Dialog, DialogDescription, DialogHeader, DialogPopup, DialogTitle } from '@sheet/ui/dialog'
import { MAX_BROWSER_CAPTURE_BYTES } from '@sheet/canvas/browser-capture'

export function BrowserCaptureImport({ onImport }: { onImport: (input: unknown) => void }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Import capture</Button>
      <Dialog open={open} onOpenChange={(next) => {
        setOpen(next)
        if (!next) setError(null)
      }}>
        <DialogPopup className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import a browser capture</DialogTitle>
            <DialogDescription>Bring a visible website section into this page as editable layers.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 p-4 text-sm">
            <ol className="list-decimal space-y-2 ps-4">
              <li>Install the Sheet Browser Capture extension from <code>extensions/browser-capture</code> in the Sheet repository. Its README includes build and installation steps.</li>
              <li>Open any website, including localhost. Click the extension, hover a section, then click to save. Use ↑ to select its parent and Esc to cancel.</li>
              <li>Choose the downloaded <code>.sheet-capture.json</code> file below.</li>
            </ol>
            <p className="text-muted-foreground">Text and boxes remain editable at the captured size. Images and unsupported effects become embedded pictures. Web fonts must be installed locally for matching text. Capture files contain visible content; review them before sharing.</p>
            <input ref={input} type="file" accept=".json,application/json" className="hidden" aria-label="Browser capture file" onChange={async (event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              setBusy(true)
              setError(null)
              try {
                if (file.size > MAX_BROWSER_CAPTURE_BYTES) throw new Error('Capture exceeds 20 MB. Select a smaller section.')
                onImport(JSON.parse(await file.text()))
                setOpen(false)
              } catch (failure) {
                setError(failure instanceof Error ? failure.message : 'The capture could not be imported.')
              } finally {
                setBusy(false)
              }
            }} />
            {error ? <p role="alert" className="text-destructive">{error}</p> : null}
            <Button disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Importing…' : 'Choose capture file'}</Button>
          </div>
        </DialogPopup>
      </Dialog>
    </>
  )
}
