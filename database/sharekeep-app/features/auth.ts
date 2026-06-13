import { supabase } from '../lib/supabase'

export type UserRole = 'recipient' | 'agent' | 'delivery_company'

export async function signUpRecipient(params: {
  email: string
  password: string
  fullName: string
  phone?: string
}) {
  const { data, error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      data: {
        role: 'recipient',
        full_name: params.fullName,
        phone: params.phone ?? null,
      },
    },
  })

  if (error) throw error
  if (!data.user) throw new Error('Failed to create user')

  return data.user
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message

  if (error && typeof error === 'object') {
    const maybeError = error as {
      message?: unknown
      error_description?: unknown
      details?: unknown
      hint?: unknown
      code?: unknown
    }

    const parts = [
      maybeError.message,
      maybeError.error_description,
      maybeError.details,
      maybeError.hint,
      maybeError.code ? `code: ${String(maybeError.code)}` : undefined,
    ].filter(Boolean)

    if (parts.length > 0) return parts.map(String).join('\n')

    try {
      return JSON.stringify(error, null, 2)
    } catch {
      return String(error)
    }
  }

  return String(error)
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) throw error
  return data.session
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  return data.user
}

export async function getProfile(userId?: string) {
  const { data, error } = await supabase.rpc('get_profile', {
    p_id: userId ?? undefined,
  })

  if (error) throw error
  return data
}

export async function upsertProfile(params: {
  id: string
  role: UserRole
  fullName: string
  phone?: string
  companyName?: string
  employeeId?: string
}) {
  const { data, error } = await supabase.rpc('upsert_profile', {
    p_id: params.id,
    p_role: params.role,
    p_full_name: params.fullName,
    p_phone: params.phone ?? null,
    p_company_name: params.companyName ?? null,
    p_employee_id: params.employeeId ?? null,
  })

  if (error) throw error
  return data
}

export async function deleteProfile(userId?: string) {
  const { data, error } = await supabase.rpc('delete_profile', {
    p_id: userId ?? undefined,
  })

  if (error) throw error
  return data as boolean
}

export async function deleteMyAccount() {
  const { data, error } = await supabase.functions.invoke('delete-my-account')

  if (error) throw error
  return data as { success: boolean; error?: string }
}
