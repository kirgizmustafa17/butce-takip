'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import Modal from '@/components/ui/Modal';

export default function HesaplarPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const { addToast } = useToast();

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    bank_name: '',
    iban: '',
    balance: '',
    currency: 'TRY',
    is_favorite: false,
  });

  // Transfer state
  const [transferData, setTransferData] = useState({
    from_account_id: '',
    to_account_id: '',
    amount: '',
    description: '',
  });

  useEffect(() => {
    fetchAccounts();
  }, []);

  async function fetchAccounts() {
    setLoading(true);
    const { data, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .order('is_favorite', { ascending: false })
      .order('name');

    if (error) {
      addToast('Hesaplar yüklenirken hata oluştu', 'error');
    } else {
      setAccounts(data || []);
    }
    setLoading(false);
  }

  function openAddModal() {
    setEditingAccount(null);
    setFormData({
      name: '',
      bank_name: '',
      iban: '',
      balance: '',
      currency: 'TRY',
      is_favorite: false,
    });
    setModalOpen(true);
  }

  function openEditModal(account) {
    setEditingAccount(account);
    setFormData({
      name: account.name,
      bank_name: account.bank_name,
      iban: account.iban || '',
      balance: account.balance.toString(),
      currency: account.currency,
      is_favorite: account.is_favorite,
    });
    setModalOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const accountData = {
      ...formData,
      balance: parseFloat(formData.balance) || 0,
    };

    let error;

    if (editingAccount) {
      const result = await supabase
        .from('bank_accounts')
        .update(accountData)
        .eq('id', editingAccount.id);
      error = result.error;
    } else {
      const result = await supabase
        .from('bank_accounts')
        .insert([accountData]);
      error = result.error;
    }

    if (error) {
      addToast('İşlem başarısız: ' + error.message, 'error');
    } else {
      addToast(editingAccount ? 'Hesap güncellendi' : 'Hesap eklendi', 'success');
      setModalOpen(false);
      fetchAccounts();
    }
  }

  async function handleDelete(id) {
    if (!confirm('Bu hesabı silmek istediğinizden emin misiniz?')) return;

    const { error } = await supabase
      .from('bank_accounts')
      .delete()
      .eq('id', id);

    if (error) {
      addToast('Silme işlemi başarısız', 'error');
    } else {
      addToast('Hesap silindi', 'success');
      fetchAccounts();
    }
  }

  async function toggleFavorite(account) {
    const { error } = await supabase
      .from('bank_accounts')
      .update({ is_favorite: !account.is_favorite })
      .eq('id', account.id);

    if (!error) {
      fetchAccounts();
    }
  }

  async function handleTransfer(e) {
    e.preventDefault();

    const amount = parseFloat(transferData.amount);
    if (!amount || amount <= 0) {
      addToast('Geçerli bir tutar girin', 'error');
      return;
    }

    const fromAccount = accounts.find(a => a.id === transferData.from_account_id);
    const toAccount = accounts.find(a => a.id === transferData.to_account_id);

    if (!fromAccount || !toAccount) {
      addToast('Hesapları seçin', 'error');
      return;
    }

    if (fromAccount.balance < amount) {
      addToast('Yetersiz bakiye', 'error');
      return;
    }

    // Start transaction
    const { error: transferError } = await supabase
      .from('transfers')
      .insert([{
        from_account_id: transferData.from_account_id,
        to_account_id: transferData.to_account_id,
        amount: amount,
        description: transferData.description || 'Hesaplar arası transfer',
        transfer_date: new Date().toISOString().split('T')[0],
      }]);

    if (transferError) {
      addToast('Transfer kaydedilemedi', 'error');
      return;
    }

    // Update balances
    await supabase
      .from('bank_accounts')
      .update({ balance: fromAccount.balance - amount })
      .eq('id', fromAccount.id);

    await supabase
      .from('bank_accounts')
      .update({ balance: toAccount.balance + amount })
      .eq('id', toAccount.id);

    addToast('Transfer başarılı', 'success');
    setTransferModalOpen(false);
    setTransferData({ from_account_id: '', to_account_id: '', amount: '', description: '' });
    fetchAccounts();
  }

  const totalBalance = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="flex justify-between items-center mb-xl">
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 'var(--spacing-xs)' }}>
            Banka Hesapları
          </h1>
          <p className="text-secondary">Tüm hesaplarınızı buradan yönetin</p>
        </div>
        <div className="flex gap-md">
          <button className="btn btn-secondary" onClick={() => setTransferModalOpen(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
            Transfer
          </button>
          <button className="btn btn-primary" onClick={openAddModal}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Hesap Ekle
          </button>
        </div>
      </div>

      {/* Total Balance Card */}
      <div className="stat-card mb-xl" style={{ textAlign: 'center' }}>
        <div className="stat-label">Toplam Bakiye</div>
        <div className="stat-value" style={{ fontSize: '2.5rem' }}>{formatCurrency(totalBalance)}</div>
        <div className="text-secondary">{accounts.length} hesap</div>
      </div>

      {/* Accounts Grid */}
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
      ) : accounts.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">🏦</div>
            <h3 className="empty-state-title">Henüz hesap yok</h3>
            <p>İlk banka hesabınızı ekleyerek başlayın</p>
            <button className="btn btn-primary mt-lg" onClick={openAddModal}>
              Hesap Ekle
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-3">
          {accounts.map((account) => (
            <div key={account.id} className="card account-card">
              <div className="flex justify-between items-start mb-md">
                <button 
                  className={`btn btn-ghost btn-icon ${account.is_favorite ? 'account-favorite' : ''}`}
                  onClick={() => toggleFavorite(account)}
                  title={account.is_favorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
                >
                  {account.is_favorite ? '★' : '☆'}
                </button>
                <div className="flex gap-sm">
                  <button className="btn btn-ghost btn-icon" onClick={() => openEditModal(account)}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                    </svg>
                  </button>
                  <button className="btn btn-ghost btn-icon text-danger" onClick={() => handleDelete(account.id)}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
              
              <h3 className="card-title">{account.name}</h3>
              <p className="account-bank">{account.bank_name}</p>
              <p className="account-balance">{formatCurrency(account.balance, account.currency)}</p>
              
              {account.iban && (
                <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: 'var(--spacing-sm)' }}>
                  {account.iban}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Account Modal */}
      <Modal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)}
        title={editingAccount ? 'Hesap Düzenle' : 'Yeni Hesap Ekle'}
      >
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Hesap Adı *</label>
            <input
              type="text"
              className="form-input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Örn: Ana Hesap"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Banka *</label>
            <input
              type="text"
              className="form-input"
              value={formData.bank_name}
              onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
              placeholder="Örn: Garanti BBVA"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">IBAN</label>
            <input
              type="text"
              className="form-input"
              value={formData.iban}
              onChange={(e) => setFormData({ ...formData, iban: e.target.value })}
              placeholder="TR00 0000 0000 0000 0000 0000 00"
            />
          </div>

          <div className="grid grid-2">
            <div className="form-group">
              <label className="form-label">Bakiye *</label>
              <input
                type="number"
                step="0.01"
                className="form-input"
                value={formData.balance}
                onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
                placeholder="0.00"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Para Birimi</label>
              <select
                className="form-select"
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              >
                <option value="TRY">TRY - Türk Lirası</option>
                <option value="USD">USD - Amerikan Doları</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - İngiliz Sterlini</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={formData.is_favorite}
                onChange={(e) => setFormData({ ...formData, is_favorite: e.target.checked })}
              />
              <span>Favori hesap olarak işaretle</span>
            </label>
          </div>

          <div className="modal-footer" style={{ padding: 0, marginTop: 'var(--spacing-lg)', borderTop: 'none' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>
              İptal
            </button>
            <button type="submit" className="btn btn-primary">
              {editingAccount ? 'Güncelle' : 'Ekle'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Transfer Modal */}
      <Modal 
        isOpen={transferModalOpen} 
        onClose={() => setTransferModalOpen(false)}
        title="Hesaplar Arası Transfer"
      >
        <form onSubmit={handleTransfer}>
          <div className="form-group">
            <label className="form-label">Kaynak Hesap *</label>
            <select
              className="form-select"
              value={transferData.from_account_id}
              onChange={(e) => setTransferData({ ...transferData, from_account_id: e.target.value })}
              required
            >
              <option value="">Hesap seçin</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} - {formatCurrency(acc.balance)}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Hedef Hesap *</label>
            <select
              className="form-select"
              value={transferData.to_account_id}
              onChange={(e) => setTransferData({ ...transferData, to_account_id: e.target.value })}
              required
            >
              <option value="">Hesap seçin</option>
              {accounts
                .filter(acc => acc.id !== transferData.from_account_id)
                .map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} - {formatCurrency(acc.balance)}
                  </option>
                ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Tutar *</label>
            <input
              type="number"
              step="0.01"
              className="form-input"
              value={transferData.amount}
              onChange={(e) => setTransferData({ ...transferData, amount: e.target.value })}
              placeholder="0.00"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Açıklama</label>
            <input
              type="text"
              className="form-input"
              value={transferData.description}
              onChange={(e) => setTransferData({ ...transferData, description: e.target.value })}
              placeholder="Transfer açıklaması"
            />
          </div>

          <div className="modal-footer" style={{ padding: 0, marginTop: 'var(--spacing-lg)', borderTop: 'none' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setTransferModalOpen(false)}>
              İptal
            </button>
            <button type="submit" className="btn btn-primary">
              Transfer Yap
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
