'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate, calculateDueDate, calculateStatementDateForTransaction, generateCashFlowProjection } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

export default function NakitAkisiPage() {
  const [accounts, setAccounts] = useState([]);
  const [cards, setCards] = useState([]);
  const [scheduledPayments, setScheduledPayments] = useState([]);
  const [cashFlow, setCashFlow] = useState([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // Calculate salary period dates
      const now = new Date();
      const currentDay = now.getDate();
      
      let startDate, endDate;
      
      if (currentDay >= 15) {
        // Current period: This month 15th to 2 months later 14th
        startDate = new Date(now.getFullYear(), now.getMonth(), 15);
        endDate = new Date(now.getFullYear(), now.getMonth() + 2, 14);
      } else {
        // Previous period overlap: Last month 15th to Next month 14th
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 15);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 14);
      }
      
      const startDateStr = format(startDate, 'yyyy-MM-dd');
      const endDateStr = format(endDate, 'yyyy-MM-dd');

      const todayStr = new Date().toISOString().split('T')[0];
      
      const [accountsRes, cardsRes, paymentsRes, transactionsRes] = await Promise.all([
        supabase.from('bank_accounts').select('*'),
        supabase.from('credit_cards').select('*, card_transactions(*)'),
        // Get all payments for this period
        supabase.from('scheduled_payments').select('*').order('payment_date'),
        // Get ALL transactions for this period (past and future)
        supabase.from('transactions')
          .select('*')
          .gte('transaction_date', startDateStr)
          .lte('transaction_date', endDateStr)
          .order('transaction_date'),
      ]);

      const accountsData = accountsRes.data || [];
      const cardsData = cardsRes.data || [];
      const paymentsData = paymentsRes.data || [];
      const transactionsData = transactionsRes.data || [];

      setAccounts(accountsData);
      setCards(cardsData);
      setScheduledPayments(paymentsData);

      // Calculate card payments with due dates based on earliest transaction
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

      // Generate projection
      const totalBalance = accountsData.reduce((sum, acc) => sum + (acc.balance || 0), 0);
      
      // Map payments: completed payments used their updated_at date, pending ones use payment_date
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const mappedPayments = paymentsData
        .filter(p => {
          // Include all pending payments scheduled for the future
          if (!p.is_completed) {
            const pDate = new Date(p.payment_date);
            return pDate >= today && pDate <= endDate;
          }
          return false;
        })
        .map(p => ({
          date: p.payment_date,
          description: p.description,
          amount: p.amount,
          type: p.payment_type
        }));
      
      // Separate transactions into past and future
      const pastTransactions = transactionsData.filter(t => new Date(t.transaction_date) < today);
      const futureTransactions = transactionsData.filter(t => new Date(t.transaction_date) >= today);
      
      // Map future transactions from transactions table
      const mappedFutureTransactions = futureTransactions
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
        cardPayments,
        startDate,
        endDate,
        pastTransactions
      );
      setCashFlow(projection);
      
      // Set Period Title
      const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
      setPeriodTitle(`${startDate.getDate()} ${monthNames[startDate.getMonth()]} - ${endDate.getDate()} ${monthNames[endDate.getMonth()]} Dönemi`);

    } catch (error) {
      console.error('Error fetching data:', error);
      addToast('Veriler yüklenirken hata oluştu', 'error');
    } finally {
      setLoading(false);
    }
  }

  const [periodTitle, setPeriodTitle] = useState('');

  const currentBalance = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
  const minBalance = Math.min(...cashFlow.map(day => day.balance));
  const maxBalance = Math.max(...cashFlow.map(day => day.balance));

  // Check for negative balance days
  const negativeDays = cashFlow.filter(day => day.balance < 0);

  // Prepare chart data
  const chartData = cashFlow.map(day => ({
    name: day.formattedDate,
    bakiye: day.balance,
    degisim: day.change
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <div className="text-center">
          <div className="skeleton" style={{ width: 60, height: 60, borderRadius: '50%', margin: '0 auto var(--spacing-md)' }}></div>
          <p className="text-secondary">Nakit akışı hesaplanıyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="flex justify-between items-center mb-xl">
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 'var(--spacing-xs)' }}>
            2 Maaş Dönemi Nakit Akışı
          </h1>
          <p className="text-secondary">{periodTitle}</p>
        </div>
        <button className="btn btn-secondary" onClick={fetchData}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Yenile
        </button>
      </div>

      {/* Warning for negative balance */}
      {negativeDays.length > 0 && (
        <div 
          className="card mb-xl" 
          style={{ 
            background: 'rgba(239, 68, 68, 0.1)', 
            borderColor: 'var(--accent-danger)' 
          }}
        >
          <div className="flex items-center gap-md">
            <div style={{ fontSize: '2rem' }}>⚠️</div>
            <div>
              <h3 className="font-semibold text-danger">Dikkat: Negatif Bakiye Riski</h3>
              <p className="text-secondary">
                Önümüzdeki 30 gün içinde {negativeDays.length} günde bakiyeniz negatife düşebilir.
                En düşük bakiye: {formatCurrency(minBalance)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-4 mb-xl">
        <div className="stat-card">
          <div className="stat-label">Mevcut Bakiye</div>
          <div className="stat-value">{formatCurrency(currentBalance)}</div>
        </div>
        <div className="stat-card success">
          <div className="stat-label">En Yüksek Bakiye</div>
          <div className="stat-value text-success">{formatCurrency(maxBalance)}</div>
        </div>
        <div className={`stat-card ${minBalance < 0 ? 'danger' : ''}`}>
          <div className="stat-label">En Düşük Bakiye</div>
          <div className={`stat-value ${minBalance < 0 ? 'text-danger' : ''}`}>{formatCurrency(minBalance)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">30 Gün Sonra</div>
          <div className="stat-value">{formatCurrency(cashFlow[cashFlow.length - 1]?.balance || 0)}</div>
        </div>
      </div>

      {/* Chart */}
      <div className="card mb-xl">
        <div className="card-header">
          <h2 className="card-title">Bakiye Grafiği</h2>
        </div>
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorBakiye" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis 
                dataKey="name" 
                stroke="#6b6b7b"
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                stroke="#6b6b7b"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip 
                contentStyle={{ 
                  background: '#1a1a2e', 
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                }}
                labelStyle={{ color: '#fff' }}
                formatter={(value) => [formatCurrency(value), 'Bakiye']}
              />
              <Area 
                type="monotone" 
                dataKey="bakiye" 
                stroke="#6366f1" 
                fillOpacity={1} 
                fill="url(#colorBakiye)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Daily Breakdown */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Günlük Detay</h2>
        </div>
        <div className="table-container" style={{ maxHeight: '500px', overflowY: 'auto' }}>
          <table className="table">
            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-tertiary)' }}>
              <tr>
                <th>Tarih</th>
                <th>Açıklama</th>
                <th className="text-right">Değişim</th>
                <th className="text-right">Bakiye</th>
              </tr>
            </thead>
            <tbody>
              {cashFlow.map((day, index) => (
                <tr 
                  key={day.dateStr}
                  style={{ 
                    background: day.balance < 0 ? 'rgba(239, 68, 68, 0.1)' : 'transparent'
                  }}
                >
                  <td>
                    <div className="font-medium">{day.formattedDate}</div>
                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                      {index === 0 ? 'Bugün' : ''}
                    </div>
                  </td>
                  <td>
                    {day.events.length === 0 ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <div className="flex flex-col gap-xs">
                        {day.events.map((event, idx) => (
                          <div key={idx} className="flex items-center gap-sm">
                            <span className={`badge ${event.type === 'income' ? 'badge-success' : 'badge-danger'}`}>
                              {event.type === 'income' ? 'Gelir' : 'Gider'}
                            </span>
                            <span>{event.description}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="text-right">
                    {day.change !== 0 ? (
                      <span className={`font-bold ${day.change > 0 ? 'text-success' : 'text-danger'}`}>
                        {day.change > 0 ? '+' : ''}{formatCurrency(day.change)}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="text-right">
                    <span className={`font-bold ${day.balance < 0 ? 'text-danger' : ''}`}>
                      {formatCurrency(day.balance)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
