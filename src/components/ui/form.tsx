"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";
import clsx from "clsx";
import type { ActionResult } from "@/lib/action-result";
import { buttonClass, inputClass, type ButtonVariant } from "./styles";

export { buttonClass, inputClass };

interface FormCtx {
  state: ActionResult;
  pending: boolean;
}
const FormStateContext = createContext<FormCtx>({ state: null, pending: false });



/**
 * Formulario conectado a una Server Action con estado (errores por campo,
 * mensajes). Funciona también sin JavaScript (progressive enhancement).
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
}: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.ok) formRef.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <FormStateContext.Provider value={{ state, pending }}>
      <form
        ref={formRef}
        action={formAction}
        className={className}
        // Envío manual: React 19 vacía el formulario tras cada acción, también
        // cuando hay errores de validación; así se conserva lo tecleado.
        onSubmit={(e) => {
          e.preventDefault();
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
          const fd = new FormData(e.currentTarget, submitter);
          startTransition(() => formAction(fd));
        }}
      >
        <FormMessage />
        {children}
      </form>
    </FormStateContext.Provider>
  );
}

export function FormMessage() {
  const { state } = useContext(FormStateContext);
  if (!state) return null;
  if (state.ok) {
    return state.message ? (
      <p className="col-span-full mb-4 rounded-lg border border-positive/20 bg-positive/10 px-3 py-2 text-sm text-positive">
        {state.message}
      </p>
    ) : null;
  }
  return (
    <p role="alert" className="col-span-full mb-4 rounded-lg border border-negative/20 bg-negative/10 px-3 py-2 text-sm text-negative">
      {state.error}
    </p>
  );
}

export function Field({
  label,
  name,
  hint,
  children,
  className,
}: {
  label: string;
  name: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const { state } = useContext(FormStateContext);
  const error = state && !state.ok ? state.fieldErrors?.[name] : undefined;
  return (
    <div className={clsx("flex flex-col gap-1", className)}>
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-negative">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({ name, label, defaultChecked }: { name: string; label: ReactNode; defaultChecked?: boolean }) {
  const { state } = useContext(FormStateContext);
  const error = state && !state.ok ? state.fieldErrors?.[name] : undefined;
  return (
    <div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-4 accent-info" />
        <span>{label}</span>
      </label>
      {error && <p className="mt-1 text-xs text-negative">{error}</p>}
    </div>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  name,
  value,
  confirm,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  name?: string;
  value?: string;
  /** Mensaje de confirmación antes de enviar (acciones destructivas). */
  confirm?: string;
}) {
  const { pending } = useContext(FormStateContext);
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={buttonClass(variant)}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? "Guardando…" : children}
    </button>
  );
}
