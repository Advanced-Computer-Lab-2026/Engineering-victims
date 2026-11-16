import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Loader2, ReceiptText, RotateCcw, Wallet } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import AlertBanner from '../components/ui/AlertBanner';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import CustomButton from '../components/ui/CustomButton';
import EmptyState from '../components/ui/EmptyState';
import { ApiError } from '../lib/api';
import { formatDate } from '../lib/studentsService';
import { fetchMyWallet, formatMoney } from '../lib/walletService';
import type { WalletResponse, WalletTransaction } from '../lib/types';

/**
 * Req 89: an Advising Student's wallet balance and transaction history.
 *
 * Every row shows the four things the workbook asks for: amount, date, the
 * related request or payment, and the balance the row left behind.
 */
const WalletPage: React.FC = () => {
  const [data, setData] = useState<WalletResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      setData(await fetchMyWallet());
    } catch (err) {
      setData(null);
      setError(err as ApiError);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const currency = data?.wallet.currency ?? 'EGP';

  return (
    <>
      <PageHeader
        title="My Wallet"
        description="Your wallet balance, refunds credited to it and payments made from it."
        onOpenNav={() => document.dispatchEvent(new CustomEvent('toggle-nav'))}
        meta={
          <CustomButton
            variant="secondary"
            size="sm"
            onClick={() => load(true)}
            isLoading={isRefreshing}
            disabled={isLoading || isRefreshing}
            icon={<RotateCcw className="h-4 w-4" aria-hidden />}
          >
            Refresh
          </CustomButton>
        }
      />

      {/* A Normal Student reaching the URL gets the reason, not a bare error. */}
      {error && (
        <div className="mb-4">
          <AlertBanner
            tone={error.status === 403 ? 'info' : 'error'}
            title={error.status === 403 ? 'No wallet on this account' : 'Could not load your wallet'}
          >
            {error.message}
          </AlertBanner>
        </div>
      )}

      {isLoading ? (
        <Card role="status" className="flex items-center justify-center gap-2 p-16 text-body text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading your wallet...
        </Card>
      ) : data ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Card tone="raised" className="p-6 md:col-span-1">
              <p className="flex items-center gap-2 text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant">
                <Wallet className="h-4 w-4 text-primary" aria-hidden />
                Current balance
              </p>
              <p className="mt-3 text-h1 font-bold tracking-tight text-on-surface">
                {formatMoney(data.wallet.balance, currency)}
              </p>
              <p className="mt-1 text-caption text-on-surface-variant">
                {/* Newest row first, so its date is the last time money moved. */}
                {data.transactions[0]
                  ? `Last transaction ${formatDate(data.transactions[0].occurredAt)}`
                  : 'No activity yet'}
              </p>
            </Card>
            <SummaryTile
              label="Refunds credited"
              value={formatMoney(data.summary.totalCredits, currency)}
              icon={<ArrowDownLeft className="h-4 w-4 text-success" aria-hidden />}
            />
            <SummaryTile
              label="Payments debited"
              value={formatMoney(data.summary.totalDebits, currency)}
              icon={<ArrowUpRight className="h-4 w-4 text-error" aria-hidden />}
            />
          </div>

          {data.transactions.length === 0 ? (
            <EmptyState
              icon={<ReceiptText className="h-5 w-5" />}
              title="No wallet transactions yet"
              description="Refunds of extra-hours payments are credited here, and wallet payments are listed here when you make them."
            />
          ) : (
            <Card tone="raised" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[48rem] text-left text-body">
                  <caption className="sr-only">Wallet transaction history, newest first</caption>
                  <thead className="border-b border-outline-variant bg-surface-container-low text-caption uppercase tracking-eyebrow text-on-surface-variant">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">Date</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Type</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Related request / payment</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Amount</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Resulting balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {data.transactions.map((row) => (
                      <TransactionRow key={row.id} row={row} currency={currency} />
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      ) : null}
    </>
  );
};

const SummaryTile: React.FC<{ label: string; value: string; icon: React.ReactNode }> = ({ label, value, icon }) => (
  <Card className="p-6">
    <p className="flex items-center gap-2 text-caption font-semibold uppercase tracking-eyebrow text-on-surface-variant">
      {icon}
      {label}
    </p>
    <p className="mt-3 text-h2 font-semibold text-on-surface">{value}</p>
  </Card>
);

const TransactionRow: React.FC<{ row: WalletTransaction; currency: string }> = ({ row, currency }) => {
  const isCredit = row.direction === 'Credit';

  return (
    <tr className="transition-colors hover:bg-surface-container">
      <td className="whitespace-nowrap px-4 py-3 text-on-surface">{formatDate(row.occurredAt)}</td>
      <td className="px-4 py-3">
        <Badge tone={isCredit ? 'emerald' : 'rose'} dot>
          {isCredit ? 'Refund credit' : 'Payment debit'}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <span className="block font-mono text-caption text-on-surface">
          {[row.requestReference, row.paymentReference].filter(Boolean).join(' · ') || '—'}
        </span>
        {row.description && <span className="mt-0.5 block text-caption text-on-surface-variant">{row.description}</span>}
      </td>
      <td
        className={`whitespace-nowrap px-4 py-3 text-right font-medium ${
          isCredit ? 'text-success' : 'text-error'
        }`}
      >
        {isCredit ? '+' : '−'}
        {formatMoney(row.amount, currency)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right text-on-surface">
        {formatMoney(row.balanceAfter, currency)}
      </td>
    </tr>
  );
};

export default WalletPage;
