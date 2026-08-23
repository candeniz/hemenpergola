'use client'

import { useTranslations } from 'next-intl'
import { useRef, useState, useTransition } from 'react'

import { addAttachmentAction, removeAttachmentAction } from '@/app/actions/project'
import { completeUploadAction, presignUploadAction } from '@/app/actions/files'
import { Button } from '@/components/ui/button'
import type { ProjectView } from '@/modules/project/application/project-service'

/**
 * Step 9 — attachments, task 4.6. `10` §Step structure puts it in stage 3, and
 * `project_summary_step_10` shows `site_plan_v2.pdf` beside the photos, which is why the model
 * has two kinds and this component accepts both.
 *
 * ## The bytes never touch the application
 *
 * `14` §Upload flow, three calls in order:
 *
 *   1. `presignUpload` — the server validates type, size and count **before** a URL exists,
 *      because after the bytes arrive the storage bill is already paid;
 *   2. `PUT` straight to storage from the browser;
 *   3. `completeUpload` → `media.process`, then `addAttachment` links the file to the project.
 *
 * `23` §Runtime keeps the web tier stateless, and a 10 MB body through a server action is the
 * opposite of that.
 *
 * ## The limits are shown here and enforced there
 *
 * The `accept` attribute and the disabled button are **conveniences**. `14` §Limits is
 * enforced in `checkUpload`, server-side, because a limit that only a disabled button knows
 * about is a limit any `curl` ignores. The numbers below come from the same policy table the
 * service reads, so the two cannot disagree about what is allowed — they are the same data.
 *
 * ## Anonymous drafts upload too
 *
 * There is no sign-in check anywhere in this component. `ADR-021` made the configurator
 * public and 4.5 made the draft ownable by a cookie; `mayUploadFor` resolves the project's
 * owner from the row, so a visitor with no account attaches photos to their own draft and to
 * nobody else's.
 */
export function ProjectAttachments({
  project,
  accept,
  maxBytes,
  maxCount,
  onChange,
}: {
  project: ProjectView
  accept: string
  maxBytes: number
  maxCount: number
  onChange: (project: ProjectView) => void
}) {
  const t = useTranslations('wizard.attachments')
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const attachments = project.attachments
  const full = attachments.length >= maxCount

  function upload(file: File) {
    setMessage(null)

    startTransition(async () => {
      /*
       * The declared size is what the server validates and pins the presigned URL to. It is
       * not trusted afterwards: `media.process` reads the object itself and `14` §Limits
       * decides the real MIME from content, so a lying client gets a URL it cannot use.
       */
      const presigned = (await presignUploadAction({
        ownerType: 'PROJECT',
        ownerId: project.projectId,
        mime: file.type,
        sizeBytes: file.size,
      })) as { data: { fileId: string; uploadUrl: string } } | { error: { message: string } }

      if ('error' in presigned) {
        setMessage(presigned.error.message)
        return
      }

      const put = await fetch(presigned.data.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type },
        body: file,
      })

      if (!put.ok) {
        setMessage(t('uploadFailed'))
        return
      }

      await completeUploadAction({ fileId: presigned.data.fileId })

      const linked = (await addAttachmentAction({
        projectId: project.projectId,
        fileId: presigned.data.fileId,
      })) as { data: ProjectView } | { error: { message: string } }

      if ('error' in linked) {
        setMessage(linked.error.message)
        return
      }

      onChange(linked.data)
      if (input.current !== null) input.current.value = ''
    })
  }

  function remove(attachmentId: string) {
    startTransition(async () => {
      const result = (await removeAttachmentAction({
        projectId: project.projectId,
        attachmentId,
      })) as { data: ProjectView } | { error: { message: string } }

      if ('error' in result) {
        setMessage(result.error.message)
        return
      }

      onChange(result.data)
    })
  }

  return (
    <section className="flex flex-col gap-base">
      <p className="text-body-sm text-muted">
        {t('limits', { count: maxCount, megabytes: Math.round(maxBytes / (1024 * 1024)) })}
      </p>

      {message === null ? null : (
        <p role="alert" className="text-body-sm text-destructive">
          {message}
        </p>
      )}

      <label className="flex flex-col gap-xs">
        <span className="text-label-md">{t('choose')}</span>
        <input
          ref={input}
          type="file"
          accept={accept}
          disabled={pending || full}
          className="text-body-sm"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file !== undefined) upload(file)
          }}
        />
      </label>

      {full ? <p className="text-body-sm text-muted">{t('full', { count: maxCount })}</p> : null}

      {attachments.length === 0 ? (
        <p className="text-body-sm text-muted">{t('empty')}</p>
      ) : (
        <ul className="flex list-none flex-col gap-xs p-0">
          {attachments.map((attachment) => (
            <li key={attachment.attachmentId} className="flex items-center gap-base">
              <span className="text-body-sm">
                {t(`kind.${attachment.kind}`)} ·{' '}
                {t('size', { kilobytes: Math.round(attachment.sizeBytes / 1024) })}
              </span>

              {/*
               * `14` §Virus scanning: a file is not served to anyone but its uploader until
               * it is `CLEAN`. The scanner itself is Q19 — `scan()` returns `CLEAN`
               * unconditionally — so this label is honest about a gate that is built and a
               * decision that is not made. It stays useful the day a real scanner lands.
               */}
              {attachment.virusScanStatus === 'CLEAN' ? null : (
                <span className="text-body-sm text-muted">
                  {t(`scan.${attachment.virusScanStatus}`)}
                </span>
              )}

              <Button
                variant="ghost"
                size="dense"
                disabled={pending}
                onClick={() => remove(attachment.attachmentId)}
              >
                {t('remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
