'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import Modal from '@/components/ui/Modal';

export default function AlacaklarPage() {
  const [debtors, setDebtors] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [editingDebtor, setEditingDebtor] = useState(null);
  const [selectedDebtor, setSelectedDebtor] = useState(null);
  const [payments, setPayments] = useState([]);
  const { addToast } = useToast();

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    notes: '',
    total_amount: '',
  });

  // Payment form state
  const [paymentData, setPaymentData] = useState({
    account_id: '',
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    description: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const [debtorsRes, accountsRes] = await Promise.all([
      supabase.from('debtors').select('*').order('created_at', { ascending: false }),
      supabase.from('bank_accounts').select('*').order('is_favorite', { ascending: false }),
    ]);

    if (!debtorsRes.error) setDebtors(debtorsRes.data || []);
    if (!accountsRes.error) setAccounts(accountsRes.data || []);
    setLoading(false);
  }

  function openAddModal() {
    setEditingDebtor(null);
    setFormData({
      name: '',
      phone: '',
      notes: '',
      total_amount: '',
    });
    setModalOpen(true);
  }

  function openEditModal(debtor) {
    setEditingDebtor(debtor);
    setFormData({
      name: debtor.name,
      phone: debtor.phone || '',
      notes: debtor.notes || '',
      total_amount: debtor.total_amount.toString(),
    });
    setModalOpen(true);
  }

  function openPaymentModal(debtor) {
    setSelectedDebtor(debtor);
    const favoriteAccount = accounts.find(a => a.is_favorite);
    setPaymentData({
      account_id: favoriteAccount?.id || '',
      amount: debtor.remaining_amount.toString(),
      payment_date: new Date().toISOString().split('T')[0],
      description: `${debtor.name} - alacak ödemesi`,
    });
    setPaymentModalOpen(true);
  }

  async function openHistoryModal(debtor) {
    setSelectedDebtor(debtor);
    const { data } = await supabase
      .from('debtor_payments')
      .select('*, bank_accounts(name)')
      .eq('debtor_id', debtor.id)
      .order('payment_date', { ascending: false });
    setPayments(data || []);
    setHistoryModalOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const amount = parseFloat(formData.total_amount) || 0;
    
    const debtorData = {
      name: formData.name,
      phone: formData.phone || null,
      notes: formData.notes || null,
      total_amount: amount,
      remaining_amount: editingDebtor ? editingDebtor.remaining_amount : amount,
    };

    let error;

    if (editingDebtor) {
      // Calculate new remaining if total changed
      const diff = amount - editingDebtor.total_amount;
      debtorData.remaining_amount = Math.max(0, editingDebtor.remaining_amount + diff);
      
      const result = await supabase
        .from('debtors')
        .update(debtorData)
        .eq('id', editingDebtor.id);
      error = result.error;
    } else {
      const result = await supabase
        .from('debtors')
        .insert([debtorData]);
      error = result.error;
    }

    if (error) {
      addToast('İşlem başarısız: ' + error.message, 'error');
    } else {
      addToast(editingDebtor ? 'Borçlu güncellendi' : 'Borçlu eklendi', 'success');
      setModalOpen(false);
      fetchData();
    }
  }

  async function handleDelete(id) {
    if (!confirm('Bu borçluyu silmek istediğinizden emin misiniz?')) return;

    const { error } = await supabase
      .from('debtors')
      .delete()
      .eq('id', id);

    if (error) {
      addToast('Silme işlemi başarısız', 'error');
    } else {
      addToast('Borçlu silindi', 'success');
      fetchData();
    }
  }

  async function handlePayment(e) {
    e.preventDefault();

    const amount = parseFloat(paymentData.amount);
    if (!amount || amount <= 0) {
      addToast('Geçerli bir tutar girin', 'error');
      return;
    }

    if (amount > selectedDebtor.remaining_amount) {
      addToast('Ödeme tutarı kalan borçtan fazla olamaz', 'error');
      return;
    }

    const account = accounts.find(a => a.id === paymentData.account_id);
    if (!account) {
      addToast('Hesap seçin', 'error');
      return;
    }

    // Record payment in debtor_payments
    const { error: paymentError } = await supabase
      .from('debtor_payments')
      .insert([{
        debtor_id: selectedDebtor.id,
        account_id: paymentData.account_id,
        amount: amount,
        payment_date: paymentData.payment_date,
        description: paymentData.description,
      }]);

    if (paymentError) {
      addToast('Ödeme kaydedilemedi: ' + paymentError.message, 'error');
      return;
    }

    // Update debtor remaining amount
    const newRemaining = selectedDebtor.remaining_amount - amount;
    await supabase
      .from('debtors')
      .update({ remaining_amount: newRemaining })
      .eq('id', selectedDebtor.id);

    // Add income to bank account
    await supabase
      .from('transactions')
      .insert([{
        account_id: paymentData.account_id,
        type: 'income',
        description: paymentData.description,
        amount: amount,
        transaction_date: paymentData.payment_date,
      }]);

    // Update account balance (only for today or past)
    const paymentDateObj = new Date(paymentData.payment_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    paymentDateObj.setHours(0, 0, 0, 0);

    if (paymentDateObj <= today) {
      await supabase
        .from('bank_accounts')
        .update({ balance: account.balance + amount })
        .eq('id', account.id);
    }

    addToast('Ödeme kaydedildi', 'success');
    setPaymentModalOpen(false);
    fetchData();
  }

  const totalReceivable = debtors.reduce((sum, d) => sum + (d.remaining_amount || 0), 0);

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="flex justify-between items-center mb-xl">
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 'var(--spacing-xs)' }}>
            Alacaklar
          </h1>
          <p className="text-secondary">Bana borçlu olanları takip edin</p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Borçlu Ekle
        </button>
      </div>

      {/* Total Receivable Card */}
      <div className="stat-card mb-xl" style={{ textAlign: 'center' }}>
        <div className="stat-label">Toplam Alacak</div>
        <div className="stat-value" style={{ fontSize: '2.5rem', color: 'var(--accent-warning)' }}>
          {formatCurrency(totalReceivable)}
        </div>
        <div className="text-secondary">{debtors.length} kişi</div>
      </div>

      {/* Debtors Grid */}
      {loading ? (
        <div className="grid grid-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="card">
              <div className="skeleton" style={{ height: 20, width: '60%', marginBottom: 'var(--spacing-md)' }}></div>
              <div className="skeleton" style={{ height: 32, width: '80%', marginBottom: 'var(--spacing-md)' }}></div>
              <div className="skeleton" style={{ height: 16, width: '40%' }}></div>
            </div>
          ))}
        </div>
      ) : debtors.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">👤</div>
            <h3 className="empty-state-title">Henüz borçlu yok</h3>
            <p>Size borçlu olan kişileri ekleyerek takip edin</p>
            <button className="btn btn-primary mt-lg" onClick={openAddModal}>
              Borçlu Ekle
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-3">
          {debtors.map((debtor) => {
            const paidAmount = debtor.total_amount - debtor.remaining_amount;
            const progress = debtor.total_amount > 0 ? (paidAmount / debtor.total_amount) * 100 : 0;
            
            return (
              <div key={debtor.id} className="card">
                <div className="flex justify-between items-start mb-md">
                  <div>
                    <h3 className="card-title" style={{ marginBottom: 'var(--spacing-xs)' }}>{debtor.name}</h3>
                    {debtor.phone && (
                      <p className="text-muted" style={{ fontSize: '0.875rem' }}>{debtor.phone}</p>
                    )}
                  </div>
                  <div className="flex gap-xs">
                    <button className="btn btn-ghost btn-icon" onClick={() => openHistoryModal(debtor)} title="Ödeme Geçmişi">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      </svg>
                    </button>
                    <button className="btn btn-ghost btn-icon" onClick={() => openEditModal(debtor)} title="Düzenle">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                      </svg>
                    </button>
                    <button className="btn btn-ghost btn-icon text-danger" onClick={() => handleDelete(debtor.id)} title="Sil">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="mb-md">
                  <div className="flex justify-between mb-xs">
                    <span className="text-muted">Kalan Borç</span>
                    <span className="font-bold" style={{ color: 'var(--accent-warning)' }}>
                      {formatCurrency(debtor.remaining_amount)}
                    </span>
                  </div>
                  <div className="flex justify-between mb-sm">
                    <span className="text-muted">Toplam</span>
                    <span>{formatCurrency(debtor.total_amount)}</span>
                  </div>
                  <div className="progress">
                    <div 
                      className="progress-bar" 
                      style={{ 
                        width: `${progress}%`,
                        background: progress === 100 ? 'var(--accent-success)' : 'var(--accent-primary)'
                      }}
                    ></div>
                  </div>
                  <div className="text-muted text-center" style={{ fontSize: '0.75rem', marginTop: 'var(--spacing-xs)' }}>
                    {formatCurrency(paidAmount)} ödendi ({progress.toFixed(0)}%)
                  </div>
                </div>

                {debtor.notes && (
                  <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: 'var(--spacing-md)' }}>
                    {debtor.notes}
                  </p>
                )}

                {debtor.remaining_amount > 0 && (
                  <button 
                    className="btn btn-success" 
                    style={{ width: '100%' }}
                    onClick={() => openPaymentModal(debtor)}
                  >
                    Ödeme Al
                  </button>
                )}
                {debtor.remaining_amount === 0 && (
                  <div className="text-center text-success font-bold" style={{ padding: 'var(--spacing-sm)' }}>
                    ✓ Tamamlandı
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Debtor Modal */}
      <Modal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)}
        title={editingDebtor ? 'Borçlu Düzenle' : 'Yeni Borçlu Ekle'}
      >
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">İsim *</label>
            <input
              type="text"
              className="form-input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Örn: Ahmet Yılmaz"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Telefon</label>
            <input
              type="tel"
              className="form-input"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="Örn: 0532 123 45 67"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Toplam Borç Tutarı *</label>
            <input
              type="number"
              step="0.01"
              className="form-input"
              value={formData.total_amount}
              onChange={(e) => setFormData({ ...formData, total_amount: e.target.value })}
              placeholder="0.00"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Notlar</label>
            <textarea
              className="form-input"
              rows={3}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Opsiyonel notlar..."
            />
          </div>

          <div className="modal-footer" style={{ padding: 0, marginTop: 'var(--spacing-lg)', borderTop: 'none' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>
              İptal
            </button>
            <button type="submit" className="btn btn-primary">
              {editingDebtor ? 'Güncelle' : 'Ekle'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Payment Modal */}
      <Modal 
        isOpen={paymentModalOpen} 
        onClose={() => setPaymentModalOpen(false)}
        title={`Ödeme Al - ${selectedDebtor?.name}`}
      >
        <form onSubmit={handlePayment}>
          <div className="stat-card mb-lg" style={{ textAlign: 'center' }}>
            <div className="stat-label">Kalan Borç</div>
            <div className="stat-value" style={{ color: 'var(--accent-warning)' }}>
              {formatCurrency(selectedDebtor?.remaining_amount || 0)}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Ödeme Tutarı *</label>
            <input
              type="number"
              step="0.01"
              className="form-input"
              value={paymentData.amount}
              onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
              placeholder="0.00"
              max={selectedDebtor?.remaining_amount}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Hangi Hesaba Gelecek? *</label>
            <select
              className="form-select"
              value={paymentData.account_id}
              onChange={(e) => setPaymentData({ ...paymentData, account_id: e.target.value })}
              required
            >
              <option value="">Hesap seçin</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.is_favorite ? '★ ' : ''}{acc.name} - {formatCurrency(acc.balance)}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Tarih</label>
            <input
              type="date"
              className="form-input"
              value={paymentData.payment_date}
              onChange={(e) => setPaymentData({ ...paymentData, payment_date: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Açıklama</label>
            <input
              type="text"
              className="form-input"
              value={paymentData.description}
              onChange={(e) => setPaymentData({ ...paymentData, description: e.target.value })}
              placeholder="Ödeme açıklaması"
            />
          </div>

          <div className="modal-footer" style={{ padding: 0, marginTop: 'var(--spacing-lg)', borderTop: 'none' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setPaymentModalOpen(false)}>
              İptal
            </button>
            <button type="submit" className="btn btn-success">
              Ödemeyi Kaydet
            </button>
          </div>
        </form>
      </Modal>

      {/* Payment History Modal */}
      <Modal 
        isOpen={historyModalOpen} 
        onClose={() => setHistoryModalOpen(false)}
        title={`Ödeme Geçmişi - ${selectedDebtor?.name}`}
      >
        {payments.length === 0 ? (
          <div className="text-center text-secondary" style={{ padding: 'var(--spacing-xl)' }}>
            Henüz ödeme kaydı yok
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Hesap</th>
                  <th className="text-right">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id}>
                    <td>{formatDate(p.payment_date, 'dd MMM yyyy')}</td>
                    <td>{p.bank_accounts?.name || '-'}</td>
                    <td className="text-right text-success font-bold">+{formatCurrency(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="modal-footer" style={{ padding: 0, marginTop: 'var(--spacing-lg)', borderTop: 'none' }}>
          <button type="button" className="btn btn-secondary" onClick={() => setHistoryModalOpen(false)}>
            Kapat
          </button>
        </div>
      </Modal>
    </div>
  );
}
