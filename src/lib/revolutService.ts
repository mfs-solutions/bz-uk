import { supabase } from './supabase';

export interface CreateRevolutOrderParams {
  amount: number;
  currency: string;
  description?: string;
  metadata?: Record<string, string>;
  customer?: {
    email?: string;
    fullName?: string;
  };
  returnUrl: string;
  cancelUrl?: string;
  failureUrl?: string;
}

export interface RevolutOrderResult {
  orderId: string;
  publicOrderId?: string;
  checkoutUrl?: string;
}

export interface VerifyRevolutOrderResult {
  orderId: string;
  orderState: string;
  isPaid: boolean;
  recoveredOrderId?: string;
}

const extractFunctionErrorMessage = async (error: any): Promise<string> => {
  if (!error) return 'Failed to initialize Revolut payment';

  const context = error?.context;
  if (context instanceof Response) {
    try {
      const payload = await context.clone().json();
      if (typeof payload?.error === 'string' && payload.error.trim()) {
        return payload.error;
      }
      if (typeof payload?.message === 'string' && payload.message.trim()) {
        return payload.message;
      }
    } catch {
      try {
        const text = await context.clone().text();
        if (text.trim()) return text;
      } catch {
        /* ignore */
      }
    }

    return `Revolut function failed with HTTP ${context.status}`;
  }

  if (typeof context === 'string' && context.trim()) return context;
  if (typeof error.message === 'string' && error.message.trim()) return error.message;
  return 'Failed to initialize Revolut payment';
};

export async function createRevolutOrder(
  params: CreateRevolutOrderParams
): Promise<RevolutOrderResult> {
  const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError || !session?.access_token) {
    const { data: { session: fallbackSession } } = await supabase.auth.getSession();
    if (!fallbackSession?.access_token) {
      throw new Error('Authentication expired. Please log in again.');
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${fallbackSession.access_token}`,
    };

    const { data, error } = await supabase.functions.invoke('create-revolut-order', {
      body: params,
      headers,
    });

    if (error) {
      throw new Error(await extractFunctionErrorMessage(error));
    }

    if (!data?.orderId) {
      throw new Error(data?.error || 'Missing Revolut order ID in response');
    }

    return data as RevolutOrderResult;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
  };

  const { data, error } = await supabase.functions.invoke('create-revolut-order', {
    body: params,
    headers,
  });

  if (error) {
    throw new Error(await extractFunctionErrorMessage(error));
  }

  if (!data?.orderId) {
    throw new Error(data?.error || 'Missing Revolut order ID in response');
  }

  return data as RevolutOrderResult;
}

export async function verifyRevolutOrder(orderId: string): Promise<VerifyRevolutOrderResult> {
  const normalizedOrderId = String(orderId || '').trim();
  if (!normalizedOrderId) {
    throw new Error('Revolut order ID is required');
  }

  const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError || !session?.access_token) {
    const { data: { session: fallbackSession } } = await supabase.auth.getSession();
    if (!fallbackSession?.access_token) {
      throw new Error('Authentication expired. Please log in again.');
    }

    const { data, error } = await supabase.functions.invoke('verify-revolut-order', {
      body: { orderId: normalizedOrderId },
      headers: {
        Authorization: `Bearer ${fallbackSession.access_token}`,
      },
    });

    if (error) {
      throw new Error(await extractFunctionErrorMessage(error));
    }

    if (!data?.orderId) {
      throw new Error(data?.error || 'Missing Revolut verification response');
    }

    return data as VerifyRevolutOrderResult;
  }

  const { data, error } = await supabase.functions.invoke('verify-revolut-order', {
    body: { orderId: normalizedOrderId },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) {
    throw new Error(await extractFunctionErrorMessage(error));
  }

  if (!data?.orderId) {
    throw new Error(data?.error || 'Missing Revolut verification response');
  }

  return data as VerifyRevolutOrderResult;
}

