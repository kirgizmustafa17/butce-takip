'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import Modal from '@/components/ui/Modal';

export default function OdemelerPage() {
  const [payments, setPayments] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [filter, setFilter] = useState('upcoming'); // 'upcoming', 'completed', 'all'
  const { addToast } = useToast();

  // Form state
  const [formData, setFormData] = useState({
    account_id: '',
    description: '',
    amount: '',
    payment_date: '',
    payment_type: 'expense',
    is_recurring: false,
    recurring_period: 'monthly',
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const [paymentsRes, accountsRes] = await Promise.all([
      supabase.from('scheduled_payments').select('*').order('payment_date'),
      supabase.from('bank_accounts').select('*').order('name'),
    ]);

    setPayments(paymentsRes.data || []);
    setAccounts(accountsRes.data || []);
    setLoading(false);
  }

  function openAddModal() {
    setEditingPayment(null);
    setFormData({
      account_id: '',
      description: '',
      amount: '',
      payment_date: new Date().toISOString().split('T')[0],
      payment_type: 'expense',
      is_recurring: false,
      recurring_period: 'monthly',
    });
    setModalOpen(true);
  }

  function openEditModal(payment) {
    setEditingPayment(payment);
    setFormData({
      account_id: payment.account_id || '',
      description: payment.description,
      amount: payment.amount.toString(),
      payment_date: payment.payment_date,
      payment_type: payment.payment_type,
      is_recurring: payment.is_recurring,
      recurring_period: payment.recurring_period || 'monthly',
    });
    setModalOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const paymentData = {
      account_id: formData.account_id || null,
      description: formData.description,
      amount: parseFloat(formData.amount) || 0,
      payment_date: formData.payment_date,
      payment_type: formData.payment_type,
      is_recurring: formData.is_recurring,
      recurring_period: formData.is_recurring ? formData.recurring_period : null,
      is_completed: false,
    };

    let error;

    if (editingPayment) {
      const result = await supabase
        .from('scheduled_payments')
        .update(paymentData)
        .eq('id', editingPayment.id);
      error = result.error;
    } else {
      const result = await supabase
        .from('scheduled_payments')
        .insert([paymentData]);
      error = result.error;
    }

    if (error) {
      addToast('İşlem başarısız: ' + error.message, 'error');
    } else {
      addToast(editingPayment ? 'Ödeme güncellendi' : 'Ödeme eklendi', 'success');
      setModalOpen(false);
      fetchData();
    }
  }

  async function handleComplete(payment) {
    // Mark as completed
    const { error } = await supabase
      .from('scheduled_payments')
      .update({ is_completed: true })
      .eq('id', payment.id);

    if (error) {
      addToast('İşlem başarısız', 'error');
      return;
    }

    // If recurring, create next payment
    if (payment.is_recurring) {
      const nextDate = new Date(payment.payment_date);
      if (payment.recurring_period === 'monthly') {
        nextDate.setMonth(nextDate.getMonth() + 1);
      } else if (payment.recurring_period === 'yearly') {
        nextDate.setFullYear(nextDate.getFullYear() + 1);
      } else if (payment.recurring_period === 'weekly') {
        nextDate.setDate(nextDate.getDate() + 7);
      }

      await supabase.from('scheduled_payments').insert([{
        account_id: payment.account_id,
        description: payment.description,
        amount: payment.amount,
        payment_date: nextDate.toISOString().split('T')[0],
        payment_type: payment.payment_type,
        is_recurring: true,
        recurring_period: payment.recurring_period,
        is_completed: false,
      }]);
    }

    // Update account balance if linked
    if (payment.account_id) {
      const account = accounts.find(a => a.id === payment.account_id);
      if (account) {
        const newBalance = payment.payment_type === 'income' 
          ? account.balance + payment.amount
          : account.balance - payment.amount;

        await supabase
          .from('bank_accounts')
          .update({ balance: newBalance })
          .eq('id', payment.account_id);
      }
    }

    addToast('Ödeme tamamlandı', 'success');
    fetchData();
  }

  async function handleDelete(id) {
    if (!confirm('Bu ödemeyi silmek istediğinizden emin misiniz?')) return;

    const { error } = await supabase
      .from('scheduled_payments')
      .delete()
      .eq('id', id);

    if (error) {
      addToast('Silme işlemi başarısız', 'error');
    } else {
      addToast('Ödeme silindi', 'success');
      fetchData();
    }
  }

  // Filter payments
  const filteredPayments = payments.filter(p => {
    if (filter === 'upcoming') return !p.is_completed;
    if (filter === 'completed') return p.is_completed;
    return true;
  });

  // Group by date
  const groupedPayments = filteredPayments.reduce((acc, payment) => {
    const month = formatDate(payment.payment_date, 'MMMM yyyy');
    if (!acc[month]) acc[month] = [];
    acc[month].push(payment);
    return acc;
  }, {});

  // Calculate totals
  const upcomingExpenses = payments
    .filter(p => !p.is_completed && p.payment_type === 'expense')
    .reduce((sum, p) => sum + p.amount, 0);
  
  const upcomingIncome = payments
    .filter(p => !p.is_completed && p.payment_type === 'income')
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="flex justify-between items-center mb-xl">
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 'var(--spacing-xs)' }}>
            Planlı Ödemeler
          </h1>
          <p className="text-secondary">Gelir ve giderlerinizi planlayın</p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Ödeme Ekle
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-3 mb-xl">
        <div className="stat-card danger">
          <div className="stat-label">Bekleyen Giderler</div>
          <div className="stat-value text-danger">{formatCurrency(upcomingExpenses)}</div>
        </div>
        <div className="stat-card success">
          <div className="stat-label">Bekleyen Gelirler</div>
          <div className="stat-value text-success">{formatCurrency(upcomingIncome)}</div>
        </div>
        <div className={`stat-card ${upcomingIncome - upcomingExpenses >= 0 ? 'success' : 'danger'}`}>
          <div className="stat-label">Net Durum</div>
          <div className={`stat-value ${upcomingIncome - upcomingExpenses >= 0 ? 'text-success' : 'text-danger'}`}>
            {formatCurrency(upcomingIncome - upcomingExpenses)}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-sm mb-lg">
        <button 
          className={`btn ${filter === 'upcoming' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFilter('upcoming')}
        >
          Bekleyenler
        </button>
        <button 
          className={`btn ${filter === 'completed' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFilter('completed')}
        >
          Tamamlananlar
        </button>
        <button 
          className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFilter('all')}
        >
          Tümü
        </button>
      </div>

      {/* Payments List */}
      {loading ? (
        <div className="card">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton" style={{ height: 60, marginBottom: 'var(--spacing-md)' }}></div>
          ))}
        </div>
      ) : filteredPayments.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📅</div>
            <h3 className="empty-state-title">Ödeme bulunamadı</h3>
            <p>Henüz planlı ödeme eklenmemiş</p>
            <button className="btn btn-primary mt-lg" onClick={openAddModal}>
              Ödeme Ekle
            </button>
          </div>
        </div>
      ) : (
        <div>
          {Object.entries(groupedPayments).map(([month, monthPayments]) => (
            <div key={month} className="mb-xl">
              <h3 className="font-semibold mb-md">{month}</h3>
              <div className="card" style={{ padding: 0 }}>
                {monthPayments.map((payment, index) => {
                  const account = accounts.find(a => a.id === payment.account_id);
                  const isOverdue = !payment.is_completed && new Date(payment.payment_date) < new Date();

                  return (
                    <div 
                      key={payment.id}
                      className="flex items-center justify-between"
                      style={{ 
                        padding: 'var(--spacing-lg)',
                        borderBottom: index < monthPayments.length - 1 ? '1px solid var(--border-color)' : 'none',
                        background: isOverdue ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                        opacity: payment.is_completed ? 0.6 : 1,
                      }}
                    >
                      <div className="flex items-center gap-md">
                        <div 
                          style={{ 
                            width: 48, 
                            height: 48, 
                            borderRadius: 'var(--border-radius-md)',
                            background: payment.payment_type === 'income' ? 'var(--gradient-success)' : 'var(--gradient-danger)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.25rem'
                          }}
                        >
                          {payment.payment_type === 'income' ? '↓' : '↑'}
                        </div>
                        <div>
                          <div className="font-medium flex items-center gap-sm">
                            {payment.description}
                            {payment.is_recurring && (
                              <span className="badge badge-info">Tekrarlı</span>
                            )}
                            {isOverdue && (
                              <span className="badge badge-danger">Gecikmiş</span>
                            )}
                            {payment.is_completed && (
                              <span className="badge badge-success">Tamamlandı</span>
                            )}
                          </div>
                          <div className="text-secondary" style={{ fontSize: '0.875rem' }}>
                            {formatDate(payment.payment_date, 'dd MMMM yyyy')}
                            {account && ` • ${account.name}`}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-lg">
                        <div className="text-right">
                          <div className={`font-bold ${payment.payment_type === 'income' ? 'text-success' : 'text-danger'}`} style={{ fontSize: '1.25rem' }}>
                            {payment.payment_type === 'income' ? '+' : '-'}{formatCurrency(payment.amount)}
                          </div>
                        </div>
                        
                        {!payment.is_completed && (
                          <div className="flex gap-sm">
                            <button 
                              className="btn btn-success btn-icon" 
                              onClick={() => handleComplete(payment)}
                              title="Tamamlandı olarak işaretle"
                            >
                              ✓
                            </button>
                            <button 
                              className="btn btn-ghost btn-icon" 
                              onClick={() => openEditModal(payment)}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                              </svg>
                            </button>
                            <button 
                              className="btn btn-ghost btn-icon text-danger" 
                              onClick={() => handleDelete(payment.id)}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)}
        title={editingPayment ? 'Ödeme Düzenle' : 'Yeni Ödeme Ekle'}
      >
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Açıklama *</label>
            <input
              type="text"
              className="form-input"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Örn: Elektrik faturası"
              required
            />
          </div>

          <div className="grid grid-2">
            <div className="form-group">
              <label className="form-label">Tutar *</label>
              <input
                type="number"
                step="0.01"
                className="form-input"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="0.00"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Tür</label>
              <select
                className="form-select"
                value={formData.payment_type}
                onChange={(e) => setFormData({ ...formData, payment_type: e.target.value })}
              >
                <option value="expense">Gider</option>
                <option value="income">Gelir</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Ödeme Tarihi *</label>
            <input
              type="date"
              className="form-input"
              value={formData.payment_date}
              onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Bağlı Hesap</label>
            <select
              className="form-select"
              value={formData.account_id}
              onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
            >
              <option value="">Hesap seçilmedi</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({formatCurrency(acc.balance)})
                </option>
              ))}
            </select>
            <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: 'var(--spacing-xs)' }}>
              Ödeme tamamlandığında hesap bakiyesi otomatik güncellenecek
            </p>
          </div>

          <div className="form-group">
            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={formData.is_recurring}
                onChange={(e) => setFormData({ ...formData, is_recurring: e.target.checked })}
              />
              <span>Tekrarlayan ödeme</span>
            </label>
          </div>

          {formData.is_recurring && (
            <div className="form-group">
              <label className="form-label">Tekrar Periyodu</label>
              <select
                className="form-select"
                value={formData.recurring_period}
                onChange={(e) => setFormData({ ...formData, recurring_period: e.target.value })}
              >
                <option value="weekly">Haftalık</option>
                <option value="monthly">Aylık</option>
                <option value="yearly">Yıllık</option>
              </select>
            </div>
          )}

          <div className="modal-footer" style={{ padding: 0, marginTop: 'var(--spacing-lg)', borderTop: 'none' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>
              İptal
            </button>
            <button type="submit" className="btn btn-primary">
              {editingPayment ? 'Güncelle' : 'Ekle'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
