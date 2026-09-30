import { apiFetch } from './api';
import type { WalletResponse } from './types';

/** Req 89. The server reads the wallet from the token, so there is no id to pass. */
export const fetchMyWallet = async (): Promise<WalletResponse> => apiFetch<WalletResponse>('/api/wallet/me');

/** "EGP 7,500.00". Always two decimals so a column of amounts lines up. */
export const formatMoney = (amount: number, currency = 'EGP'): string =>
  `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
