'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import { fetchMultiplePrices, calculateProfitLoss, INVESTMENT_TYPES } from '@/lib/priceApi';
import { useToast } from '@/components/ui/Toast';
import Modal from '@/components/ui/Modal';

export default function YatirimlarPage() {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [pricesLoading, setPricesLoading] = useState(true);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const { addToast } = useToast();

  // Account form state
  const [accountFormData, setAccountFormData] = useState({
    name: '',
    type: 'XAU',
    bank_name: '',
    location: '',
    is_physical: false,
  });

  // Transaction form state
  const [txFormData, setTxFormData] = useState({
    account_id: '',
    type: 'buy',
    quantity: '',
    price_per_unit: '',
    transaction_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  useEffect(() => {
    fetchData();
    fetchPrices();
  }, []);

  async function fetchData() {
    setLoading(true);
    const [accountsRes, txRes] = await Promise.all([
      supabase.from('investment_accounts').select('*').order('type').order('name'),
      supabase.from('investment_transactions').select('*').order('transaction_date', { ascending: false }).limit(50),
    ]);

    if (!accountsRes.error) setAccounts(accountsRes.data || []);
    if (!txRes.error) setTransactions(txRes.data || []);
    setLoading(false);
  }

  async function fetchPrices() {
    setPricesLoading(true);
    try {
      const types = Object.keys(INVESTMENT_TYPES);
      const priceData = await fetchMultiplePrices(types);
      setPrices(priceData);
    } catch (error) {
      console.error('Price fetch error:', error);
    }
    setPricesLoading(false);
  }

  function openAddAccountModal() {
    setEditingAccount(null);
    setAccountFormData({
      name: '',
      type: 'XAU',
      bank_name: '',
      location: '',
      is_physical: false,
    });
    setAccountModalOpen(true);
  }

  function openEditAccountModal(account) {
    setEditingAccount(account);
    setAccountFormData({
      name: account.name,
      type: account.type,
      bank_name: account.bank_name || '',
      location: account.location || '',
      is_physical: account.is_physical,
    });
    setAccountModalOpen(true);
  }

  function openTransactionModal(account = null) {
    setTxFormData({
      account_id: account?.id || '',
      type: 'buy',
      quantity: '',
      price_per_unit: prices[account?.type] || '',
      transaction_date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setEditingTransaction(null);
    setTransactionModalOpen(true);
  }

  function openEditTransactionModal(tx) {
    setTxFormData({
      account_id: tx.account_id,
      type: tx.type,
      quantity: tx.quantity.toString(),
      price_per_unit: tx.price_per_unit.toString(),
      transaction_date: tx.transaction_date,
      notes: tx.notes || '',
    });
    setEditingTransaction(tx);
    setTransactionModalOpen(true);
  }

  async function handleDeleteTransaction(tx) {
    if (!confirm('Bu işlemi silmek istediğinizden emin misiniz? Hesap bakiyesi güncellenecek.')) return;

    const account = accounts.find(a => a.id === tx.account_id);
    if (!account) {
      addToast('Hesap bulunamadı', 'error');
      return;
    }

    // Reverse the transaction effect on account
    let newQuantity, newAverageCost;

    if (tx.type === 'buy') {
      // Undo buy: subtract quantity and recalculate average cost
      newQuantity = account.quantity - tx.quantity;
      if (newQuantity <= 0) {
        newQuantity = 0;
        newAverageCost = 0;
      } else {
        // Recalculate: (current_total_cost - tx_amount) / new_quantity
        const currentTotalCost = account.quantity * (account.average_cost || 0);
        const newTotalCost = currentTotalCost - tx.total_amount;
        newAverageCost = newTotalCost > 0 ? newTotalCost / newQuantity : account.average_cost;
      }
    } else {
      // Undo sell: add quantity back
      newQuantity = account.quantity + tx.quantity;
      newAverageCost = account.average_cost || 0;
    }

    // Delete transaction
    const { error: deleteError } = await supabase
      .from('investment_transactions')
      .delete()
      .eq('id', tx.id);

    if (deleteError) {
      addToast('İşlem silinemedi: ' + deleteError.message, 'error');
      return;
    }

    // Update account
    await supabase
      .from('investment_accounts')
      .update({ quantity: newQuantity, average_cost: newAverageCost })
      .eq('id', account.id);

    addToast('İşlem silindi ve bakiye güncellendi', 'success');
    fetchData();
  }

  async function handleAccountSubmit(e) {
    e.preventDefault();

    const accountData = {
      name: accountFormData.name,
      type: accountFormData.type,
      bank_name: accountFormData.bank_name || null,
      location: accountFormData.location || null,
      is_physical: accountFormData.is_physical,
    };

    let error;

    if (editingAccount) {
      const result = await supabase
        .from('investment_accounts')
        .update(accountData)
        .eq('id', editingAccount.id);
      error = result.error;
    } else {
      accountData.quantity = 0;
      accountData.average_cost = 0;
      const result = await supabase
        .from('investment_accounts')
        .insert([accountData]);
      error = result.error;
    }

    if (error) {
      addToast('İşlem başarısız: ' + error.message, 'error');
    } else {
      addToast(editingAccount ? 'Hesap güncellendi' : 'Hesap eklendi', 'success');
      setAccountModalOpen(false);
      fetchData();
    }
  }

  async function handleDeleteAccount(id) {
    if (!confirm('Bu yatırım hesabını ve tüm işlemlerini silmek istediğinizden emin misiniz?')) return;

    const { error } = await supabase
      .from('investment_accounts')
      .delete()
      .eq('id', id);

    if (error) {
      addToast('Silme işlemi başarısız', 'error');
    } else {
      addToast('Hesap silindi', 'success');
      fetchData();
    }
  }

  async function handleTransactionSubmit(e) {
    e.preventDefault();

    const quantity = parseFloat(txFormData.quantity);
    const pricePerUnit = parseFloat(txFormData.price_per_unit);
    
    if (!quantity || quantity <= 0 || !pricePerUnit || pricePerUnit <= 0) {
      addToast('Geçerli miktar ve fiyat girin', 'error');
      return;
    }

    const newAccount = accounts.find(a => a.id === txFormData.account_id);
    if (!newAccount) {
      addToast('Hesap seçin', 'error');
      return;
    }

    const totalAmount = quantity * pricePerUnit;
    const oldTx = editingTransaction;
    const isAccountChanged = oldTx && oldTx.account_id !== txFormData.account_id;

    // Calculate new account balance
    let newAccQuantity = newAccount.quantity;
    let newAccTotalCost = newAccount.quantity * (newAccount.average_cost || 0);

    // If editing same account, reverse old transaction first
    if (oldTx && !isAccountChanged) {
      if (oldTx.type === 'buy') {
        newAccQuantity -= oldTx.quantity;
        newAccTotalCost -= oldTx.total_amount;
      } else {
        newAccQuantity += oldTx.quantity;
      }
    }

    // Check for sell: do we have enough?
    if (txFormData.type === 'sell' && quantity > newAccQuantity) {
      addToast('Yetersiz miktar! Mevcut: ' + newAccQuantity.toFixed(4), 'error');
      return;
    }

    // Apply new transaction to new account
    let finalNewQuantity, finalNewAvgCost;

    if (txFormData.type === 'buy') {
      const finalTotalCost = newAccTotalCost + totalAmount;
      finalNewQuantity = newAccQuantity + quantity;
      finalNewAvgCost = finalNewQuantity > 0 ? finalTotalCost / finalNewQuantity : 0;
    } else {
      finalNewQuantity = newAccQuantity - quantity;
      finalNewAvgCost = newAccTotalCost > 0 && newAccQuantity > 0 ? newAccTotalCost / newAccQuantity : newAccount.average_cost || 0;
    }

    // If account changed during edit, calculate old account balance
    let oldAccQuantity, oldAccAvgCost;
    let oldAccount = null;
    
    if (isAccountChanged) {
      oldAccount = accounts.find(a => a.id === oldTx.account_id);
      if (oldAccount) {
        oldAccQuantity = oldAccount.quantity;
        let oldAccTotalCost = oldAccount.quantity * (oldAccount.average_cost || 0);

        // Reverse old transaction from old account
        if (oldTx.type === 'buy') {
          oldAccQuantity -= oldTx.quantity;
          oldAccTotalCost -= oldTx.total_amount;
          oldAccAvgCost = oldAccQuantity > 0 ? oldAccTotalCost / oldAccQuantity : 0;
        } else {
          oldAccQuantity += oldTx.quantity;
          oldAccAvgCost = oldAccount.average_cost || 0;
        }
      }
    }

    let error;

    if (editingTransaction) {
      // Update existing transaction
      const result = await supabase
        .from('investment_transactions')
        .update({
          account_id: txFormData.account_id,
          type: txFormData.type,
          quantity: quantity,
          price_per_unit: pricePerUnit,
          total_amount: totalAmount,
          transaction_date: txFormData.transaction_date,
          notes: txFormData.notes || null,
        })
        .eq('id', editingTransaction.id);
      error = result.error;
    } else {
      // Insert new transaction
      const result = await supabase
        .from('investment_transactions')
        .insert([{
          account_id: txFormData.account_id,
          type: txFormData.type,
          quantity: quantity,
          price_per_unit: pricePerUnit,
          total_amount: totalAmount,
          transaction_date: txFormData.transaction_date,
          notes: txFormData.notes || null,
        }]);
      error = result.error;
    }

    if (error) {
      addToast('İşlem kaydedilemedi: ' + error.message, 'error');
      return;
    }

    // Update new account
    await supabase
      .from('investment_accounts')
      .update({ 
        quantity: finalNewQuantity,
        average_cost: finalNewAvgCost
      })
      .eq('id', newAccount.id);

    // Update old account if changed
    if (isAccountChanged && oldAccount) {
      await supabase
        .from('investment_accounts')
        .update({ 
          quantity: oldAccQuantity,
          average_cost: oldAccAvgCost
        })
        .eq('id', oldAccount.id);
    }

    addToast(editingTransaction ? 'İşlem güncellendi' : (txFormData.type === 'buy' ? 'Alım kaydedildi' : 'Satış kaydedildi'), 'success');
    setTransactionModalOpen(false);
    setEditingTransaction(null);
    fetchData();
  }

  // Group accounts by type
  const groupedAccounts = accounts.reduce((acc, account) => {
    if (!acc[account.type]) acc[account.type] = [];
    acc[account.type].push(account);
    return acc;
  }, {});

  // Calculate totals
  let totalCost = 0;
  let totalValue = 0;

  accounts.forEach(acc => {
    const currentPrice = prices[acc.type] || acc.average_cost;
    totalCost += acc.quantity * (acc.average_cost || 0);
    totalValue += acc.quantity * currentPrice;
  });

  const totalProfitLoss = totalValue - totalCost;
  const totalProfitLossPercent = totalCost > 0 ? (totalProfitLoss / totalCost) * 100 : 0;

  return (
    <div className="animate-fadeIn">
      {/* Current Prices - Horizontal Bar */}
      <div className="card mb-xl" style={{ padding: 'var(--spacing-sm) var(--spacing-md)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-lg)', overflowX: 'auto' }}>
        <div className="text-secondary font-bold whitespace-nowrap" style={{ fontSize: '0.875rem' }}>🔥 Güncel Fiyatlar:</div>
        <div className="flex gap-lg items-center" style={{ minWidth: 'max-content' }}>
          {Object.entries(INVESTMENT_TYPES).map(([code, info]) => (
            <div key={code} className="flex items-center gap-xs">
              <span className="text-secondary" style={{ fontSize: '0.75rem' }}>{info.name}:</span>
              <span className="font-bold" style={{ fontSize: '0.875rem' }}>
                {prices[code] ? formatCurrency(prices[code]) : '...'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Header */}
      <div className="flex justify-between items-center mb-xl">
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 'var(--spacing-xs)' }}>
            Yatırım Hesapları
          </h1>
          <p className="text-secondary">Farklı banka ve lokasyonlardaki yatırımlarınızı takip edin</p>
        </div>
        <div className="flex gap-md">
          <button className="btn btn-secondary" onClick={fetchPrices} disabled={pricesLoading}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18" style={{ animation: pricesLoading ? 'spin 1s linear infinite' : 'none' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            Fiyatları Güncelle
          </button>
          <button className="btn btn-secondary" onClick={() => openTransactionModal()}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
            Alım/Satım
          </button>
          <button className="btn btn-primary" onClick={openAddAccountModal}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Hesap Ekle
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-3 mb-xl">
        <div className="stat-card">
          <div className="stat-label">Toplam Maliyet</div>
          <div className="stat-value">{formatCurrency(totalCost)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Güncel Değer</div>
          <div className="stat-value">{formatCurrency(totalValue)}</div>
          {pricesLoading && <div className="text-muted" style={{ fontSize: '0.75rem' }}>Fiyatlar güncelleniyor...</div>}
        </div>
        <div className={`stat-card ${totalProfitLoss >= 0 ? 'success' : 'danger'}`}>
          <div className="stat-label">Kar / Zarar</div>
          <div className={`stat-value ${totalProfitLoss >= 0 ? 'text-success' : 'text-danger'}`}>
            {totalProfitLoss >= 0 ? '+' : ''}{formatCurrency(totalProfitLoss)}
          </div>
          <div className="text-secondary" style={{ fontSize: '0.875rem' }}>
            {totalProfitLossPercent >= 0 ? '+' : ''}{totalProfitLossPercent.toFixed(2)}%
          </div>
        </div>
      </div>



      {/* Accounts */}
      {loading ? (
        <div className="grid grid-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card">
              <div className="skeleton" style={{ height: 24, width: '40%', marginBottom: 'var(--spacing-md)' }}></div>
              <div className="skeleton" style={{ height: 40, width: '60%', marginBottom: 'var(--spacing-md)' }}></div>
              <div className="skeleton" style={{ height: 16, width: '30%' }}></div>
            </div>
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📈</div>
            <h3 className="empty-state-title">Henüz yatırım hesabı yok</h3>
            <p>Farklı banka veya lokasyonlar için yatırım hesabı oluşturun</p>
            <button className="btn btn-primary mt-lg" onClick={openAddAccountModal}>
              Hesap Ekle
            </button>
          </div>
        </div>
      ) : (
        <div>
          {Object.entries(groupedAccounts).map(([type, typeAccounts]) => {
            const typeInfo = INVESTMENT_TYPES[type] || { name: type, unit: 'adet' };
            const currentPrice = prices[type];

            // Calculate type totals
            const typeTotal = typeAccounts.reduce((acc, account) => {
              acc.quantity += account.quantity;
              acc.cost += account.quantity * (account.average_cost || 0);
              acc.value += account.quantity * (currentPrice || account.average_cost || 0);
              return acc;
            }, { quantity: 0, cost: 0, value: 0 });

            const typeProfitLoss = typeTotal.value - typeTotal.cost;

            return (
              <div key={type} className="mb-xl">
                <div className="flex items-center gap-md mb-md">
                  <div style={{ 
                    width: 40, 
                    height: 40, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    fontSize: '1.5rem',
                    background: 'var(--bg-glass)',
                    borderRadius: 'var(--border-radius-md)'
                  }}>
                    {type === 'XAU' && '🪙'}
                    {type === 'XAG' && '🥈'}
                    {type === 'USD' && '💵'}
                    {type === 'EUR' && '💶'}
                    {type === 'GBP' && '💷'}
                  </div>
                  <div>
                    <h3 className="font-semibold">{typeInfo.name}</h3>
                    <div className="text-secondary" style={{ fontSize: '0.875rem' }}>
                      Toplam: {typeTotal.quantity.toFixed(4)} {typeInfo.unit} • 
                      Değer: {formatCurrency(typeTotal.value)} •
                      <span className={typeProfitLoss >= 0 ? 'text-success' : 'text-danger'}>
                        {' '}{typeProfitLoss >= 0 ? '+' : ''}{formatCurrency(typeProfitLoss)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-2">
                  {typeAccounts.map(account => {
                    const accountValue = account.quantity * (currentPrice || account.average_cost || 0);
                    const accountCost = account.quantity * (account.average_cost || 0);
                    const accountProfitLoss = accountValue - accountCost;
                    const accountProfitPercent = accountCost > 0 ? (accountProfitLoss / accountCost) * 100 : 0;

                    return (
                      <div key={account.id} className="card">
                        <div className="flex justify-between items-start mb-md">
                          <div>
                            <h4 className="font-medium">{account.name}</h4>
                            <div className="text-secondary" style={{ fontSize: '0.875rem' }}>
                              {account.is_physical ? '📦 Fiziksel' : '🏦 ' + (account.bank_name || 'Banka')}
                              {account.location && ` - ${account.location}`}
                            </div>
                          </div>
                          <div className="flex gap-sm">
                            <button 
                              className="btn btn-ghost btn-icon" 
                              onClick={() => openTransactionModal(account)}
                              title="Alım/Satım"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                              </svg>
                            </button>
                            <button className="btn btn-ghost btn-icon" onClick={() => openEditAccountModal(account)}>
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                              </svg>
                            </button>
                            <button className="btn btn-ghost btn-icon text-danger" onClick={() => handleDeleteAccount(account.id)}>
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-2 gap-md">
                          <div>
                            <div className="text-muted" style={{ fontSize: '0.75rem' }}>Miktar</div>
                            <div className="font-medium">{account.quantity.toFixed(4)} {typeInfo.unit}</div>
                          </div>
                          <div>
                            <div className="text-muted" style={{ fontSize: '0.75rem' }}>Ort. Maliyet</div>
                            <div className="font-medium">{formatCurrency(account.average_cost || 0)} / {typeInfo.unit}</div>
                          </div>
                          <div>
                            <div className="text-muted" style={{ fontSize: '0.75rem' }}>Toplam Maliyet</div>
                            <div className="font-medium">{formatCurrency(accountCost)}</div>
                          </div>
                          <div>
                            <div className="text-muted" style={{ fontSize: '0.75rem' }}>Güncel Değer</div>
                            <div className="font-medium">{formatCurrency(accountValue)}</div>
                          </div>
                        </div>

                        {account.quantity > 0 && (
                          <div 
                            className={`mt-md ${accountProfitLoss >= 0 ? 'text-success' : 'text-danger'}`}
                            style={{ 
                              padding: 'var(--spacing-sm) var(--spacing-md)',
                              background: accountProfitLoss >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                              borderRadius: 'var(--border-radius-sm)',
                              textAlign: 'center'
                            }}
                          >
                            <span className="font-bold">
                              {accountProfitLoss >= 0 ? '+' : ''}{formatCurrency(accountProfitLoss)}
                            </span>
                            <span style={{ marginLeft: 'var(--spacing-sm)' }}>
                              ({accountProfitPercent >= 0 ? '+' : ''}{accountProfitPercent.toFixed(2)}%)
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent Transactions */}
      {transactions.length > 0 && (
        <div className="card mt-xl">
          <div className="card-header">
            <h2 className="card-title">Son İşlemler</h2>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Hesap</th>
                  <th>Tür</th>
                  <th className="text-right">Miktar</th>
                  <th className="text-right">Birim Fiyat</th>
                  <th className="text-right">Toplam</th>
                  <th>Açıklama</th>
                  <th className="text-right">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 10).map(tx => {
                  const account = accounts.find(a => a.id === tx.account_id);
                  const typeInfo = INVESTMENT_TYPES[account?.type] || { unit: 'adet' };
                  return (
                    <tr key={tx.id}>
                      <td>{formatDate(tx.transaction_date, 'dd MMM yyyy')}</td>
                      <td>{account?.name || '-'}</td>
                      <td>
                        <span className={`badge ${tx.type === 'buy' ? 'badge-success' : 'badge-danger'}`}>
                          {tx.type === 'buy' ? 'Alış' : 'Satış'}
                        </span>
                      </td>
                      <td className="text-right">{tx.quantity} {typeInfo.unit}</td>
                      <td className="text-right">{formatCurrency(tx.price_per_unit)}</td>
                      <td className={`text-right font-bold ${tx.type === 'buy' ? 'text-danger' : 'text-success'}`}>
                        {tx.type === 'buy' ? '-' : '+'}{formatCurrency(tx.total_amount)}
                      </td>
                      <td title={tx.notes || ''} style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tx.notes ? (tx.notes.length > 20 ? tx.notes.substring(0, 20) + '...' : tx.notes) : '-'}
                      </td>
                      <td className="text-right">
                        <div className="flex gap-sm justify-end">
                          <button 
                            className="btn btn-ghost btn-icon" 
                            onClick={() => openEditTransactionModal(tx)}
                            title="Düzenle"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="16" height="16">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                            </svg>
                          </button>
                          <button 
                            className="btn btn-ghost btn-icon text-danger" 
                            onClick={() => handleDeleteTransaction(tx)}
                            title="Sil"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="16" height="16">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Account Modal */}
      <Modal 
        isOpen={accountModalOpen} 
        onClose={() => setAccountModalOpen(false)}
        title={editingAccount ? 'Hesap Düzenle' : 'Yeni Yatırım Hesabı'}
      >
        <form onSubmit={handleAccountSubmit}>
          <div className="form-group">
            <label className="form-label">Yatırım Türü *</label>
            <select
              className="form-select"
              value={accountFormData.type}
              onChange={(e) => setAccountFormData({ ...accountFormData, type: e.target.value })}
              required
              disabled={editingAccount}
            >
              {Object.entries(INVESTMENT_TYPES).map(([code, info]) => (
                <option key={code} value={code}>{info.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Hesap Adı *</label>
            <input
              type="text"
              className="form-input"
              value={accountFormData.name}
              onChange={(e) => setAccountFormData({ ...accountFormData, name: e.target.value })}
              placeholder="Örn: Kuveyt Türk Altın Hesabı"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={accountFormData.is_physical}
                onChange={(e) => setAccountFormData({ ...accountFormData, is_physical: e.target.checked })}
              />
              <span>Fiziksel yatırım (kasa, çelik kasa, vb.)</span>
            </label>
          </div>

          {!accountFormData.is_physical && (
            <div className="form-group">
              <label className="form-label">Banka</label>
              <input
                type="text"
                className="form-input"
                value={accountFormData.bank_name}
                onChange={(e) => setAccountFormData({ ...accountFormData, bank_name: e.target.value })}
                placeholder="Örn: Kuveyt Türk"
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Konum / Açıklama</label>
            <input
              type="text"
              className="form-input"
              value={accountFormData.location}
              onChange={(e) => setAccountFormData({ ...accountFormData, location: e.target.value })}
              placeholder={accountFormData.is_physical ? "Örn: Evde, Çelik kasa" : "Örn: Vadeli hesap"}
            />
          </div>

          <div className="modal-footer" style={{ padding: 0, marginTop: 'var(--spacing-lg)', borderTop: 'none' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setAccountModalOpen(false)}>
              İptal
            </button>
            <button type="submit" className="btn btn-primary">
              {editingAccount ? 'Güncelle' : 'Hesap Oluştur'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Transaction Modal (Buy/Sell) */}
      <Modal 
        isOpen={transactionModalOpen} 
        onClose={() => { setTransactionModalOpen(false); setEditingTransaction(null); }}
        title={editingTransaction ? 'İşlem Düzenle' : 'Alım / Satım İşlemi'}
      >
        <form onSubmit={handleTransactionSubmit}>
          <div className="form-group">
            <label className="form-label">Hesap *</label>
            <select
              className="form-select"
              value={txFormData.account_id}
              onChange={(e) => {
                const account = accounts.find(a => a.id === e.target.value);
                setTxFormData({ 
                  ...txFormData, 
                  account_id: e.target.value,
                  price_per_unit: prices[account?.type] || ''
                });
              }}
              required
            >
              <option value="">Hesap seçin</option>
              {accounts.map(acc => {
                const typeInfo = INVESTMENT_TYPES[acc.type] || { name: acc.type, unit: 'adet' };
                return (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.quantity.toFixed(2)} {typeInfo.unit})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">İşlem Türü</label>
            <div className="flex gap-md">
              <button
                type="button"
                className={`btn ${txFormData.type === 'buy' ? 'btn-success' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setTxFormData({ ...txFormData, type: 'buy' })}
              >
                ↓ Alış
              </button>
              <button
                type="button"
                className={`btn ${txFormData.type === 'sell' ? 'btn-danger' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setTxFormData({ ...txFormData, type: 'sell' })}
              >
                ↑ Satış
              </button>
            </div>
          </div>

          <div className="grid grid-2">
            <div className="form-group">
              <label className="form-label">Miktar *</label>
              <input
                type="number"
                step="0.0001"
                className="form-input"
                value={txFormData.quantity}
                onChange={(e) => setTxFormData({ ...txFormData, quantity: e.target.value })}
                placeholder="10.5"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Birim Fiyat (₺) *</label>
              <input
                type="number"
                step="0.01"
                className="form-input"
                value={txFormData.price_per_unit}
                onChange={(e) => setTxFormData({ ...txFormData, price_per_unit: e.target.value })}
                placeholder="2850.00"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">İşlem Tarihi</label>
            <input
              type="date"
              className="form-input"
              value={txFormData.transaction_date}
              onChange={(e) => setTxFormData({ ...txFormData, transaction_date: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Not</label>
            <input
              type="text"
              className="form-input"
              value={txFormData.notes}
              onChange={(e) => setTxFormData({ ...txFormData, notes: e.target.value })}
              placeholder="Opsiyonel not..."
            />
          </div>

          {txFormData.quantity && txFormData.price_per_unit && (
            <div className="stat-card" style={{ marginTop: 'var(--spacing-md)' }}>
              <div className="text-secondary" style={{ fontSize: '0.875rem' }}>
                {txFormData.type === 'buy' ? 'Toplam Maliyet' : 'Toplam Gelir'}
              </div>
              <div className="font-bold" style={{ fontSize: '1.25rem' }}>
                {formatCurrency(parseFloat(txFormData.quantity) * parseFloat(txFormData.price_per_unit))}
              </div>
            </div>
          )}

          <div className="modal-footer" style={{ padding: 0, marginTop: 'var(--spacing-lg)', borderTop: 'none' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setTransactionModalOpen(false)}>
              İptal
            </button>
            <button type="submit" className={`btn ${txFormData.type === 'buy' ? 'btn-success' : 'btn-danger'}`}>
              {txFormData.type === 'buy' ? 'Alış Yap' : 'Satış Yap'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
