'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState, useTransition } from 'react'

import {
  confirmPhoneVerificationAction,
  loginAction,
  registerAction,
  requestPasswordResetAction,
  resendEmailVerificationAction,
  resetPasswordAction,
  startPhoneVerificationAction,
  verifyEmailAction,
} from '@/app/actions/auth'
import { AuthNotice } from '@/components/auth/auth-card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Link } from '@/i18n/navigation'

/**
 * The five auth forms (`26-execution-plan.md` row 1.4) and the phone one (row 1.5).
 *
 * Client components, because they are the definition of real interactivity — but they hold
 * no rules. Every one calls a server action, which parses with the same Zod schema the
 * `/api/v1` route handler parses with and calls the same service method. The password
 * policy, the token lifetimes, the enumeration-proof responses: none of that is repeated
 * here, and none of it can drift, because this file cannot express it.
 *
 * What *is* here is the mapping from an error `code` to a sentence in the user's language.
 * `06-api-specification.md` says clients switch on `code` and never parse `message`, so this
 * switches on `code`.
 */

type ActionOutcome = { status: number } & (
  { data: unknown; meta: unknown } | { error: { code: string; message: string } }
)

function isError(outcome: ActionOutcome): outcome is { status: number } & {
  error: { code: string; message: string }
} {
  return 'error' in outcome
}

/**
 * Controlled fields.
 *
 * **React 19 resets an uncontrolled `<form action={…}>` once the action resolves.** For a
 * successful submit that is what you want; for a rejected one it silently empties every
 * field the person just filled in — so a mistyped password on the register screen costs them
 * their name, their email and the consent tick as well. It is invisible in review because
 * nothing in this file mentions resetting.
 *
 * The end-to-end suite found it the hard way: it refilled only the password after a failed
 * login, the emptied email field then failed validation, and the screen reported "e-posta
 * veya şifre hatalı" — technically true, and about the wrong thing entirely.
 *
 * Holding the values in state also means the action reads what the user typed rather than
 * what survived in the DOM.
 */
function useFields<T extends Record<string, string>>(initial: T) {
  const [values, setValues] = useState<T>(initial)

  return {
    values,
    /** Spread onto a `Field`: binds value, change handler and id in one place. */
    bind: (name: keyof T & string) => ({
      id: name,
      name,
      value: values[name],
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        setValues((current) => ({ ...current, [name]: event.target.value })),
    }),
    reset: () => setValues(initial),
  }
}

/** A field, with its label bound and its hint associated. */
function Field({
  id,
  label,
  hint,
  ...props
}: { id: string; label: string; hint?: string } & React.ComponentProps<'input'>) {
  return (
    <div className="flex flex-col gap-base">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-describedby={hint === undefined ? undefined : `${id}-hint`} {...props} />
      {hint === undefined ? null : (
        <p id={`${id}-hint`} className="text-body-sm text-muted">
          {hint}
        </p>
      )}
    </div>
  )
}

export function RegisterForm() {
  const t = useTranslations('auth')
  const common = useTranslations('common')
  const [pending, start] = useTransition()
  const [done, setDone] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [consented, setConsented] = useState(false)
  const fields = useFields({ fullName: '', email: '', password: '' })

  if (done) {
    return (
      <AuthNotice tone="success" title={t('register.done')}>
        {t('register.doneBody')}
      </AuthNotice>
    )
  }

  return (
    <form
      className="flex flex-col gap-md"
      action={() => {
        if (!consented) {
          setProblem(t('register.consentRequired'))
          return
        }
        setProblem(null)

        start(async () => {
          const outcome = (await registerAction({
            ...fields.values,
            locale: document.documentElement.lang === 'en' ? 'en' : 'tr',
          })) as ActionOutcome

          if (isError(outcome)) {
            // CONFLICT is the password policy; anything else is a validation problem with
            // the fields. Neither one says whether the address already exists — the service
            // is careful about that and the screen must not undo it.
            setProblem(outcome.error.code === 'CONFLICT' ? t('passwordHint') : common('errorBody'))
            return
          }
          setDone(true)
        })
      }}
    >
      <Field {...fields.bind('fullName')} label={t('fullNameLabel')} autoComplete="name" required />
      <Field
        {...fields.bind('email')}
        type="email"
        label={t('emailLabel')}
        placeholder={t('emailPlaceholder')}
        autoComplete="email"
        required
      />
      <Field
        {...fields.bind('password')}
        type="password"
        label={t('passwordLabel')}
        hint={t('passwordHint')}
        autoComplete="new-password"
        required
      />

      {/*
       * The consent checkbox is unticked by default and the submit is refused without it.
       * `19-security-and-kvkk.md` §Consent: a pre-ticked box is not consent, and the record
       * the service writes carries the version of the text that was linked here.
       */}
      <div className="flex items-start gap-base">
        <Checkbox
          id="consent"
          checked={consented}
          onCheckedChange={(value) => setConsented(value === true)}
        />
        <Label htmlFor="consent" className="normal-case text-body-sm text-on-panel">
          {t('register.consent')}
        </Label>
      </div>

      {problem === null ? null : <AuthNotice tone="error" title={problem} />}

      <Button type="submit" variant="confirm" size="touch" disabled={pending}>
        {pending ? t('submitting') : t('register.submit')}
      </Button>
    </form>
  )
}

export function LoginForm() {
  const t = useTranslations('auth')
  const [pending, start] = useTransition()
  const [problem, setProblem] = useState<string | null>(null)
  const [tokens, setTokens] = useState(false)
  const fields = useFields({ email: '', password: '' })

  return (
    <form
      className="flex flex-col gap-md"
      action={() => {
        setProblem(null)
        setTokens(false)
        start(async () => {
          const outcome = (await loginAction(fields.values)) as ActionOutcome

          if (isError(outcome)) {
            // FORBIDDEN covers unknown email, wrong password and a suspended account — one
            // answer, deliberately (`12` §Credentials). The screen keeps it that way.
            setProblem(
              outcome.error.code === 'RATE_LIMITED' ? t('login.slowed') : t('login.failed'),
            )
            return
          }
          setTokens(true)

          /*
           * A full navigation, not a router push. The session cookie was set by the server
           * action, and the destination is a Server Component that reads it — a client-side
           * push would render from a cache populated while signed out.
           *
           * Until `ADR-022` this line did not exist and neither did the session: the form
           * showed a tick and stayed where it was, which is how Q23 survived three phases.
           */
          window.location.assign('/hesap')
        })
      }}
    >
      <Field
        {...fields.bind('email')}
        type="email"
        label={t('emailLabel')}
        placeholder={t('emailPlaceholder')}
        autoComplete="email"
        required
      />
      <Field
        {...fields.bind('password')}
        type="password"
        label={t('passwordLabel')}
        autoComplete="current-password"
        required
      />

      {problem === null ? null : <AuthNotice tone="error" title={problem} />}
      {tokens ? <AuthNotice tone="success" title={t('login.submit')} /> : null}

      <Button type="submit" variant="confirm" size="touch" disabled={pending}>
        {pending ? t('submitting') : t('login.submit')}
      </Button>

      <Link
        href="/sifre-sifirla"
        className="text-body-sm text-action underline-offset-4 hover:underline"
      >
        {t('login.forgot')}
      </Link>
    </form>
  )
}

export function ForgotPasswordForm() {
  const t = useTranslations('auth')
  const [pending, start] = useTransition()
  const [sent, setSent] = useState(false)
  const fields = useFields({ email: '' })

  if (sent) {
    return (
      <AuthNotice tone="success" title={t('forgot.done')}>
        {t('forgot.doneBody')}
      </AuthNotice>
    )
  }

  return (
    <form
      className="flex flex-col gap-md"
      action={() => {
        start(async () => {
          // The result is not inspected on purpose: the service answers `{ sent: true }` for
          // every address, and branching here would reintroduce the disclosure it avoids.
          await requestPasswordResetAction(fields.values)
          setSent(true)
        })
      }}
    >
      <Field
        {...fields.bind('email')}
        type="email"
        label={t('emailLabel')}
        placeholder={t('emailPlaceholder')}
        autoComplete="email"
        required
      />
      <Button type="submit" variant="confirm" size="touch" disabled={pending}>
        {pending ? t('submitting') : t('forgot.submit')}
      </Button>
    </form>
  )
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const t = useTranslations('auth')
  const [pending, start] = useTransition()
  const [state, setState] = useState<
    { kind: 'form' } | { kind: 'done'; revoked: number } | { kind: 'invalid' }
  >(token === null || token === '' ? { kind: 'invalid' } : { kind: 'form' })
  const fields = useFields({ password: '' })

  if (state.kind === 'invalid') {
    return (
      <AuthNotice tone="error" title={t('reset.invalidToken')}>
        <p>{t('reset.invalidTokenBody')}</p>
        <Link href="/sifre-sifirla" className="text-action underline-offset-4 hover:underline">
          {t('reset.requestNew')}
        </Link>
      </AuthNotice>
    )
  }

  if (state.kind === 'done') {
    return (
      <AuthNotice tone="success" title={t('reset.done')}>
        <p>{t('reset.doneBody')}</p>
        <p>{t('reset.sessionsRevoked', { count: state.revoked })}</p>
      </AuthNotice>
    )
  }

  return (
    <form
      className="flex flex-col gap-md"
      action={() => {
        start(async () => {
          const outcome = (await resetPasswordAction({
            token,
            password: fields.values.password,
          })) as ActionOutcome

          if (isError(outcome)) {
            setState(outcome.error.code === 'FORBIDDEN' ? { kind: 'invalid' } : { kind: 'form' })
            return
          }
          const revoked =
            typeof outcome === 'object' && 'data' in outcome
              ? ((outcome.data as { revokedSessions: number }).revokedSessions ?? 0)
              : 0
          setState({ kind: 'done', revoked })
        })
      }}
    >
      <Field
        {...fields.bind('password')}
        type="password"
        label={t('reset.newPassword')}
        hint={t('passwordHint')}
        autoComplete="new-password"
        required
      />
      <Button type="submit" variant="confirm" size="touch" disabled={pending}>
        {pending ? t('submitting') : t('reset.submit')}
      </Button>
    </form>
  )
}

/**
 * Email verification runs on mount: the user arrived by clicking a link, and asking them to
 * click a second button to confirm they clicked the first is a step that exists only because
 * it was easier to build.
 */
export function VerifyEmailPanel({ token }: { token: string | null }) {
  const t = useTranslations('auth')
  const [state, setState] = useState<'working' | 'done' | 'failed' | 'missing'>(
    token === null || token === '' ? 'missing' : 'working',
  )
  const [resent, setResent] = useState(false)
  const [pending, start] = useTransition()
  const resend = useFields({ email: '' })

  useEffect(() => {
    if (token === null || token === '') return

    let cancelled = false
    void verifyEmailAction({ token }).then((outcome) => {
      if (cancelled) return
      setState('error' in outcome ? 'failed' : 'done')
    })

    return () => {
      cancelled = true
    }
  }, [token])

  if (state === 'working') return <AuthNotice tone="info" title={t('verifyEmail.title')} />

  if (state === 'done') {
    return (
      <AuthNotice tone="success" title={t('verifyEmail.done')}>
        <p>{t('verifyEmail.doneBody')}</p>
        <Link href="/giris" className="text-action underline-offset-4 hover:underline">
          {t('verifyEmail.continue')}
        </Link>
      </AuthNotice>
    )
  }

  return (
    <div className="flex flex-col gap-md">
      <AuthNotice
        tone="error"
        title={state === 'missing' ? t('verifyEmail.missingToken') : t('verifyEmail.failed')}
      >
        {state === 'missing' ? null : t('verifyEmail.failedBody')}
      </AuthNotice>

      {resent ? (
        <AuthNotice tone="info" title={t('verifyEmail.resent')} />
      ) : (
        <form
          className="flex flex-col gap-md"
          action={() => {
            start(async () => {
              await resendEmailVerificationAction(resend.values)
              setResent(true)
            })
          }}
        >
          <Field
            {...resend.bind('email')}
            type="email"
            label={t('emailLabel')}
            placeholder={t('emailPlaceholder')}
            autoComplete="email"
            required
          />
          <Button type="submit" variant="outline" size="touch" disabled={pending}>
            {pending ? t('submitting') : t('verifyEmail.resend')}
          </Button>
        </form>
      )}
    </div>
  )
}

const RESEND_SECONDS = 60

export function VerifyPhoneForm({ smsProvider }: { smsProvider: string }) {
  const t = useTranslations('auth')
  const [pending, start] = useTransition()
  const [stage, setStage] = useState<'phone' | 'code' | 'done'>('phone')
  const [problem, setProblem] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const phone = useFields({ phone: '' })
  const otp = useFields({ code: '' })

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  if (stage === 'done') return <AuthNotice tone="success" title={t('verifyPhone.done')} />

  return (
    <div className="flex flex-col gap-md">
      {/*
       * Q3 is open: no SMS provider is chosen, so the log adapter prints the code. Saying so
       * is better than a developer waiting for a text that is never going to arrive.
       */}
      {smsProvider === 'log' ? (
        <AuthNotice tone="info" title={t('verifyPhone.logAdapterNotice')} />
      ) : null}

      {stage === 'phone' ? (
        <form
          className="flex flex-col gap-md"
          action={() => {
            setProblem(null)
            start(async () => {
              const outcome = (await startPhoneVerificationAction(phone.values)) as ActionOutcome

              if (isError(outcome)) {
                setProblem(outcome.error.message)
                return
              }
              setCooldown(RESEND_SECONDS)
              setStage('code')
            })
          }}
        >
          <Field
            {...phone.bind('phone')}
            type="tel"
            label={t('phoneLabel')}
            placeholder={t('phonePlaceholder')}
            autoComplete="tel"
            required
          />
          {problem === null ? null : <AuthNotice tone="error" title={problem} />}
          <Button type="submit" variant="confirm" size="touch" disabled={pending}>
            {pending ? t('submitting') : t('verifyPhone.send')}
          </Button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-md"
          action={() => {
            setProblem(null)
            start(async () => {
              const outcome = (await confirmPhoneVerificationAction(otp.values)) as ActionOutcome

              if (isError(outcome)) {
                setProblem(
                  outcome.error.code === 'RATE_LIMITED'
                    ? t('verifyPhone.tooManyAttempts')
                    : t('verifyPhone.wrongCode'),
                )
                return
              }
              setStage('done')
            })
          }}
        >
          <Field
            {...otp.bind('code')}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            label={t('verifyPhone.codeLabel')}
            hint={t('verifyPhone.codeHint')}
            required
          />
          {problem === null ? null : <AuthNotice tone="error" title={problem} />}
          <Button type="submit" variant="confirm" size="touch" disabled={pending}>
            {pending ? t('submitting') : t('verifyPhone.confirm')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="dense"
            disabled={cooldown > 0}
            onClick={() => setStage('phone')}
          >
            {cooldown > 0
              ? t('verifyPhone.resendIn', { seconds: cooldown })
              : t('verifyPhone.resend')}
          </Button>
        </form>
      )}
    </div>
  )
}
