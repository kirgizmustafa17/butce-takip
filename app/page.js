'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate, calculateDueDate, calculateStatementDateForTransaction, generateCashFlowProjection } from '@/lib/utils';
import { fetchMultiplePrices, calculateProfitLoss, INVESTMENT_TYPES } from '@/lib/priceApi';
import Link from 'next/link';

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const [cards, setCards] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [scheduledPayments, setScheduledPayments] = useState([]);
  const [prices, setPrices] = useState({});
  const [cashFlow, setCashFlow] = useState([]);
  const [debtors, setDebtors] = useState([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    setLoading(true);
    try {
      // Fetch all data in parallel
      const [accountsRes, cardsRes, investmentsRes, paymentsRes, debtorsRes] = await Promise.all([
        supabase.from('bank_accounts').select('*').order('is_favorite', { ascending: false }),
        supabase.from('credit_cards').select('*, card_transactions(*)'),
        supabase.from('investment_accounts').select('*'),
        supabase.from('scheduled_payments').select('*').eq('is_completed', false).order('payment_date'),
        supabase.from('debtors').select('remaining_amount'),
      ]);

      const accountsData = accountsRes.data || [];
      const cardsData = cardsRes.data || [];
      const investmentsData = investmentsRes.data || [];
      const paymentsData = paymentsRes.data || [];

      setAccounts(accountsData);
      setCards(cardsData);
      setInvestments(investmentsData);
      setScheduledPayments(paymentsData);
      setDebtors(debtorsRes.data || []);

      // Fetch investment prices
      const investmentTypes = [...new Set(investmentsData.map(inv => inv.type))];
      if (investmentTypes.length > 0) {
        const { prices: priceData } = await fetchMultiplePrices(investmentTypes);
        setPrices(priceData);
      }

      // Calculate card payments for cash flow
      const cardPayments = cardsData.map(card => {
        const unpaidTransactions = (card.card_transactions || []).filter(t => !t.is_paid);
        const totalDue = unpaidTransactions.reduce((sum, t) => {
          if (t.installments > 1) {
            return sum + (t.amount / t.installments);
          }
          return sum + t.amount;
        }, 0);

        // Calculate due date based on earliest unpaid transaction
        let dueDate;
        if (unpaidTransactions.length > 0) {
          const earliestTx = unpaidTransactions.reduce((earliest, t) => {
            const txDate = new Date(t.transaction_date);
            return txDate < earliest ? txDate : earliest;
          }, new Date(unpaidTransactions[0].transaction_date));
          const statementDate = calculateStatementDateForTransaction(card.statement_day, earliestTx);
          dueDate = new Date(statementDate);
          dueDate.setDate(dueDate.getDate() + 10);
        } else {
          dueDate = calculateDueDate(card.statement_day);
        }

        return {
          cardName: card.name,
          dueDate: dueDate,
          amount: totalDue
        };
      }).filter(p => p.amount > 0);

      // Fetch future transactions for cash flow
      const todayStr = new Date().toISOString().split('T')[0];
      const futureTransactionsRes = await supabase
        .from('transactions')
        .select('*')
        .gte('transaction_date', todayStr)
        .order('transaction_date');
      const futureTransactionsData = futureTransactionsRes.data || [];

      // Generate cash flow projection
      const totalBalance = accountsData.reduce((sum, acc) => sum + (acc.balance || 0), 0);

      // Filter to include only future pending payments
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const mappedPayments = paymentsData
        .filter(p => !p.is_completed && new Date(p.payment_date) >= today)
        .map(p => ({
          date: p.payment_date,
          description: p.description,
          amount: p.amount,
          type: p.payment_type
        }));

      // Map future transactions from transactions table
      const mappedFutureTransactions = futureTransactionsData
        .filter(t => new Date(t.transaction_date) > today) // Only include strictly future transactions
        .map(t => ({
          date: t.transaction_date,
          description: t.description,
          amount: t.amount,
          type: t.type
        }));

      // Combine all payments for projection
      const allScheduledPayments = [...mappedPayments, ...mappedFutureTransactions];

      const projection = generateCashFlowProjection(
        totalBalance,
        allScheduledPayments,
        cardPayments
      );
      setCashFlow(projection);

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  // Calculate totals
  const totalCash = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);

  // Calculate total debt from unpaid card transactions (dynamic calculation)
  const totalDebt = cards.reduce((sum, card) => {
    const unpaidTransactions = (card.card_transactions || []).filter(t => !t.is_paid);
    const cardDebt = unpaidTransactions.reduce((txSum, t) => txSum + t.amount, 0);
    return sum + cardDebt;
  }, 0);

  // Calculate total investment value
  const totalInvestmentValue = investments.reduce((sum, inv) => {
    const currentPrice = prices[inv.type];
    if (currentPrice) {
      return sum + (inv.quantity * currentPrice);
    }
    return sum + (inv.quantity * (inv.average_cost || 0));
  }, 0);

  const totalInvestmentCost = investments.reduce((sum, inv) => {
    return sum + (inv.quantity * (inv.average_cost || 0));
  }, 0);

  const investmentProfitLoss = totalInvestmentValue - totalInvestmentCost;
  const netWorth = totalCash + totalInvestmentValue - totalDebt;

  // Calculate total receivables (NOT included in netWorth as requested)
  const totalReceivable = debtors.reduce((sum, d) => sum + (d.remaining_amount || 0), 0);

  // Get upcoming payments (next 7 days)
  const upcomingPayments = cashFlow.slice(0, 7).filter(day => day.events.length > 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <div className="text-center">
          <div className="skeleton" style={{ width: 60, height: 60, borderRadius: '50%', margin: '0 auto var(--spacing-md)' }}></div>
          <p className="text-secondary">Veriler yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard animate-fadeIn">
      {/* Stats Cards */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Toplam Nakit</div>
          <div className="stat-value">{formatCurrency(totalCash)}</div>
          <div className="text-secondary" style={{ fontSize: '0.875rem' }}>
            {accounts.length} hesap
          </div>
        </div>

        <div className="stat-card danger">
          <div className="stat-label">Toplam Borç</div>
          <div className="stat-value text-danger">{formatCurrency(totalDebt)}</div>
          <div className="text-secondary" style={{ fontSize: '0.875rem' }}>
            {cards.length} kredi kartı
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Yatırım Değeri</div>
          <div className="stat-value">{formatCurrency(totalInvestmentValue)}</div>
          <div className={`investment-profit ${investmentProfitLoss >= 0 ? 'positive' : 'negative'}`}>
            {investmentProfitLoss >= 0 ? '+' : ''}{formatCurrency(investmentProfitLoss)}
            ({((investmentProfitLoss / (totalInvestmentCost || 1)) * 100).toFixed(1)}%)
          </div>
        </div>

        <div className="stat-card success">
          <div className="stat-label">Net Değer</div>
          <div className="stat-value text-success">{formatCurrency(netWorth)}</div>
          <div className="text-secondary" style={{ fontSize: '0.875rem' }}>
            Varlıklar - Borçlar
          </div>
        </div>

        {totalReceivable > 0 && (
          <Link href="/alacaklar" className="stat-card" style={{ textDecoration: 'none' }}>
            <div className="stat-label">Toplam Alacak</div>
            <div className="stat-value" style={{ color: 'var(--accent-warning)' }}>{formatCurrency(totalReceivable)}</div>
            <div className="text-secondary" style={{ fontSize: '0.875rem' }}>
              {debtors.length} kişiden
            </div>
          </Link>
        )}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-2" style={{ marginBottom: 'var(--spacing-xl)' }}>
        {/* Bank Accounts */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Banka Hesapları</h2>
            <Link href="/hesaplar" className="btn btn-ghost">
              Tümünü Gör
            </Link>
          </div>
          <div className="card-body">
            {accounts.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--spacing-lg)' }}>
                <p>Henüz hesap eklenmemiş</p>
                <Link href="/hesaplar" className="btn btn-primary mt-md">
                  Hesap Ekle
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-sm">
                {accounts.slice(0, 3).map((account) => (
                  <div key={account.id} className="flex items-center justify-between" style={{
                    padding: 'var(--spacing-md)',
                    background: 'var(--bg-glass)',
                    borderRadius: 'var(--border-radius-md)'
                  }}>
                    <div className="flex items-center gap-md">
                      {account.is_favorite && (
                        <span className="account-favorite">★</span>
                      )}
                      <div>
                        <div className="font-medium">{account.name}</div>
                        <div className="text-secondary" style={{ fontSize: '0.875rem' }}>{account.bank_name}</div>
                      </div>
                    </div>
                    <div className="font-bold">{formatCurrency(account.balance)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Credit Cards */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Kredi Kartları</h2>
            <Link href="/kartlar" className="btn btn-ghost">
              Tümünü Gör
            </Link>
          </div>
          <div className="card-body">
            {cards.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--spacing-lg)' }}>
                <p>Henüz kart eklenmemiş</p>
                <Link href="/kartlar" className="btn btn-primary mt-md">
                  Kart Ekle
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-sm">
                {cards.slice(0, 3).map((card) => {
                  const usagePercent = ((card.used_limit || 0) / card.total_limit) * 100;
                  return (
                    <div key={card.id} style={{
                      padding: 'var(--spacing-md)',
                      background: 'var(--bg-glass)',
                      borderRadius: 'var(--border-radius-md)'
                    }}>
                      <div className="flex justify-between mb-sm">
                        <div>
                          <div className="font-medium">{card.name}</div>
                          <div className="text-secondary" style={{ fontSize: '0.875rem' }}>{card.bank_name}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-danger font-bold">{formatCurrency(card.used_limit || 0)}</div>
                          <div className="text-muted" style={{ fontSize: '0.75rem' }}>/ {formatCurrency(card.total_limit)}</div>
                        </div>
                      </div>
                      <div className="progress">
                        <div
                          className={`progress-bar ${usagePercent > 80 ? 'danger' : ''}`}
                          style={{ width: `${Math.min(usagePercent, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cash Flow Preview & Investments */}
      <div className="grid grid-2">
        {/* Upcoming Payments */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Yaklaşan Ödemeler</h2>
            <Link href="/nakit-akisi" className="btn btn-ghost">
              30 Günlük Tahmin
            </Link>
          </div>
          <div className="card-body">
            {upcomingPayments.length === 0 ? (
              <div className="text-center text-secondary" style={{ padding: 'var(--spacing-lg)' }}>
                Önümüzdeki 7 gün içinde ödeme yok
              </div>
            ) : (
              <div className="flex flex-col">
                {upcomingPayments.map((day) => (
                  day.events.map((event, idx) => (
                    <div
                      key={`${day.dateStr}-${idx}`}
                      className="flex justify-between items-center"
                      style={{
                        padding: 'var(--spacing-md)',
                        borderBottom: '1px solid var(--border-color)'
                      }}
                    >
                      <div>
                        <div className="font-medium">{event.description}</div>
                        <div className="text-secondary" style={{ fontSize: '0.875rem' }}>{day.formattedDate}</div>
                      </div>
                      <div className={`font-bold ${event.type === 'income' ? 'text-success' : 'text-danger'}`}>
                        {event.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(event.amount))}
                      </div>
                    </div>
                  ))
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Investments */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Yatırımlar</h2>
            <Link href="/yatirimlar" className="btn btn-ghost">
              Tümünü Gör
            </Link>
          </div>
          <div className="card-body">
            {investments.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--spacing-lg)' }}>
                <p>Henüz yatırım eklenmemiş</p>
                <Link href="/yatirimlar" className="btn btn-primary mt-md">
                  Yatırım Ekle
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-sm">
                {investments.slice(0, 4).map((inv) => {
                  const currentPrice = prices[inv.type] || inv.average_cost;
                  const profitLoss = calculateProfitLoss(inv.quantity, inv.average_cost || 0, currentPrice);
                  const typeInfo = INVESTMENT_TYPES[inv.type] || { name: inv.type, unit: 'adet' };

                  return (
                    <div key={inv.id} className="investment-card" style={{
                      padding: 'var(--spacing-md)',
                      background: 'var(--bg-glass)',
                      borderRadius: 'var(--border-radius-md)'
                    }}>
                      <div className={`investment-icon ${inv.type.toLowerCase()}`}>
                        {inv.type === 'XAU' && '🪙'}
                        {inv.type === 'XAG' && '🥈'}
                        {inv.type === 'USD' && '$'}
                        {inv.type === 'EUR' && '€'}
                        {inv.type === 'GBP' && '£'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="font-medium">{inv.name}</div>
                        <div className="text-secondary" style={{ fontSize: '0.875rem' }}>
                          {inv.quantity} {typeInfo.unit}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{formatCurrency(profitLoss.currentValue)}</div>
                        <div className={`investment-profit ${profitLoss.isProfit ? 'positive' : 'negative'}`}>
                          {profitLoss.isProfit ? '+' : ''}{formatCurrency(profitLoss.profitLoss)}
                          ({profitLoss.profitLossPercent.toFixed(1)}%)
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
