'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate, calculateDueDate, calculateStatementDateForTransaction, calculateNextStatementDate } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import Modal from '@/components/ui/Modal';

export default function HesaplarPage() {
  const [accounts, setAccounts] = useState([]);
  const [cards, setCards] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);
  const [cardPaymentModalOpen, setCardPaymentModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [editingTransaction, setEditingTransaction] = useState(null);
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

  // Transaction state (income/expense)
  const [transactionData, setTransactionData] = useState({
    account_id: '',
    type: 'expense',
    description: '',
    amount: '',
    transaction_date: new Date().toISOString().split('T')[0],
  });

  // Card payment state
  const [cardPaymentData, setCardPaymentData] = useState({
    card_id: '',
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
    const [accountsRes, cardsRes, transactionsRes] = await Promise.all([
      supabase.from('bank_accounts').select('*').order('is_favorite', { ascending: false }).order('name'),
      supabase.from('credit_cards').select('*, card_transactions(*)'),
      supabase.from('transactions').select('*').order('transaction_date', { ascending: false }).limit(50),
    ]);

    if (!accountsRes.error) setAccounts(accountsRes.data || []);
    if (!cardsRes.error) {
      const cardsWithDebt = (cardsRes.data || []).map(card => {
        const unpaidTransactions = (card.card_transactions || []).filter(t => !t.is_paid);
        const totalDebt = unpaidTransactions.reduce((sum, t) => {
          if (t.installments > 1) return sum + (t.amount / t.installments);
          return sum + t.amount;
        }, 0);
        return { ...card, current_debt: totalDebt };
      });
      setCards(cardsWithDebt);
    }
    if (!transactionsRes.error) setTransactions(transactionsRes.data || []);
    
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

  function openTransactionModal(account = null) {
    const favoriteAccount = accounts.find(a => a.is_favorite);
    setTransactionData({
      account_id: account?.id || favoriteAccount?.id || '',
      type: 'expense',
      description: '',
      amount: '',
      transaction_date: new Date().toISOString().split('T')[0],
    });
    setTransactionModalOpen(true);
  }

  function openCardPaymentModal(card = null) {
    const favoriteAccount = accounts.find(a => a.is_favorite);
    setCardPaymentData({
      card_id: card?.id || '',
      account_id: favoriteAccount?.id || '',
      amount: card?.current_debt?.toString() || '',
      payment_date: new Date().toISOString().split('T')[0],
      description: card ? `${card.name} kart ödemesi` : 'Kart ödemesi',
    });
    setCardPaymentModalOpen(true);
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
      fetchData();
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
      fetchData();
    }
  }

  async function toggleFavorite(account) {
    // Clear other favorites first
    if (!account.is_favorite) {
      await supabase
        .from('bank_accounts')
        .update({ is_favorite: false })
        .neq('id', account.id);
    }

    const { error } = await supabase
      .from('bank_accounts')
      .update({ is_favorite: !account.is_favorite })
      .eq('id', account.id);

    if (!error) {
      fetchData();
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

    // Record transfer
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
    fetchData();
  }

  async function handleTransaction(e) {
    e.preventDefault();

    const amount = parseFloat(transactionData.amount);
    if (!amount || amount <= 0) {
      addToast('Geçerli bir tutar girin', 'error');
      return;
    }

    const account = accounts.find(a => a.id === transactionData.account_id);
    if (!account) {
      addToast('Hesap seçin', 'error');
      return;
    }

    // Check balance for expense
    if (transactionData.type === 'expense' && account.balance < amount) {
      addToast('Yetersiz bakiye', 'error');
      return;
    }

    // Record transaction
    const { error: txError } = await supabase
      .from('transactions')
      .insert([{
        account_id: transactionData.account_id,
        type: transactionData.type,
        description: transactionData.description,
        amount: amount,
        transaction_date: transactionData.transaction_date,
      }]);

    if (txError) {
      addToast('İşlem kaydedilemedi: ' + txError.message, 'error');
      return;
    }

    // Only update account balance if transaction date is today or in the past
    const transactionDateObj = new Date(transactionData.transaction_date);
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    transactionDateObj.setHours(0, 0, 0, 0);
    
    if (transactionDateObj <= todayDate) {
      const newBalance = transactionData.type === 'income' 
        ? account.balance + amount 
        : account.balance - amount;

      await supabase
        .from('bank_accounts')
        .update({ balance: newBalance })
        .eq('id', account.id);
    }

    addToast(transactionData.type === 'income' ? 'Gelir eklendi' : 'Gider eklendi', 'success');
    setTransactionModalOpen(false);
    setEditingTransaction(null);
    fetchData();
  }

  function openEditTransactionModal(tx) {
    setEditingTransaction(tx);
    setTransactionData({
      account_id: tx.account_id,
      type: tx.type,
      description: tx.description,
      amount: tx.amount.toString(),
      transaction_date: tx.transaction_date,
    });
    setTransactionModalOpen(true);
  }

  async function handleUpdateTransaction(e) {
    e.preventDefault();

    const amount = parseFloat(transactionData.amount);
    if (!amount || amount <= 0) {
      addToast('Geçerli bir tutar girin', 'error');
      return;
    }

    const account = accounts.find(a => a.id === transactionData.account_id);
    if (!account) {
      addToast('Hesap seçin', 'error');
      return;
    }

    const oldTx = editingTransaction;
    const oldAccount = accounts.find(a => a.id === oldTx.account_id);
    
    // Calculate balance adjustments
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const oldTxDate = new Date(oldTx.transaction_date);
    oldTxDate.setHours(0, 0, 0, 0);
    const wasApplied = oldTxDate <= today;
    
    const newTxDate = new Date(transactionData.transaction_date);
    newTxDate.setHours(0, 0, 0, 0);
    const willBeApplied = newTxDate <= today;

    // Update the transaction record
    const { error: txError } = await supabase
      .from('transactions')
      .update({
        account_id: transactionData.account_id,
        type: transactionData.type,
        description: transactionData.description,
        amount: amount,
        transaction_date: transactionData.transaction_date,
      })
      .eq('id', oldTx.id);

    if (txError) {
      addToast('İşlem güncellenemedi: ' + txError.message, 'error');
      return;
    }

    // Reverse old balance effect if it was applied
    if (wasApplied && oldAccount) {
      const reversedBalance = oldTx.type === 'income' 
        ? oldAccount.balance - oldTx.amount 
        : oldAccount.balance + oldTx.amount;
      
      await supabase
        .from('bank_accounts')
        .update({ balance: reversedBalance })
        .eq('id', oldAccount.id);
    }

    // Apply new balance effect if needed (refetch account for current balance)
    if (willBeApplied) {
      const { data: currentAccount } = await supabase
        .from('bank_accounts')
        .select('balance')
        .eq('id', transactionData.account_id)
        .single();
      
      if (currentAccount) {
        const newBalance = transactionData.type === 'income' 
          ? currentAccount.balance + amount 
          : currentAccount.balance - amount;

        await supabase
          .from('bank_accounts')
          .update({ balance: newBalance })
          .eq('id', transactionData.account_id);
      }
    }

    addToast('İşlem güncellendi', 'success');
    setTransactionModalOpen(false);
    setEditingTransaction(null);
    fetchData();
  }

  async function handleDeleteTransaction(tx) {
    if (!confirm(`"${tx.description}" işlemini silmek istediğinizden emin misiniz?`)) return;

    const account = accounts.find(a => a.id === tx.account_id);
    
    // Calculate if balance was affected
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const txDate = new Date(tx.transaction_date);
    txDate.setHours(0, 0, 0, 0);
    const wasApplied = txDate <= today;

    // Delete the transaction
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', tx.id);

    if (error) {
      addToast('İşlem silinemedi: ' + error.message, 'error');
      return;
    }

    // Reverse balance effect if it was applied
    if (wasApplied && account) {
      const newBalance = tx.type === 'income' 
        ? account.balance - tx.amount 
        : account.balance + tx.amount;

      await supabase
        .from('bank_accounts')
        .update({ balance: newBalance })
        .eq('id', account.id);
    }

    addToast('İşlem silindi', 'success');
    fetchData();
  }

  async function handleCardPayment(e) {
    e.preventDefault();

    const amount = parseFloat(cardPaymentData.amount);
    if (!amount || amount <= 0) {
      addToast('Geçerli bir tutar girin', 'error');
      return;
    }

    const account = accounts.find(a => a.id === cardPaymentData.account_id);
    const card = cards.find(c => c.id === cardPaymentData.card_id);

    if (!account || !card) {
      addToast('Hesap ve kart seçin', 'error');
      return;
    }

    if (account.balance < amount) {
      addToast('Yetersiz bakiye', 'error');
      return;
    }

    // Record card payment
    const { error: paymentError } = await supabase
      .from('card_payments')
      .insert([{
        card_id: cardPaymentData.card_id,
        account_id: cardPaymentData.account_id,
        amount: amount,
        payment_date: cardPaymentData.payment_date,
        description: cardPaymentData.description,
      }]);

    if (paymentError) {
      addToast('Ödeme kaydedilemedi: ' + paymentError.message, 'error');
      return;
    }

    // Update account balance
    await supabase
      .from('bank_accounts')
      .update({ balance: account.balance - amount })
      .eq('id', account.id);

    // Mark card transactions as paid (up to the payment amount)
    const unpaidTx = (card.card_transactions || []).filter(t => !t.is_paid);
    let remainingAmount = amount;
    
    for (const tx of unpaidTx) {
      if (remainingAmount <= 0) break;
      
      const txAmount = tx.installments > 1 ? tx.amount / tx.installments : tx.amount;
      if (remainingAmount >= txAmount) {
        await supabase
          .from('card_transactions')
          .update({ is_paid: true })
          .eq('id', tx.id);
        remainingAmount -= txAmount;
      }
    }

    addToast('Kart ödemesi yapıldı', 'success');
    setCardPaymentModalOpen(false);
    fetchData();
  }

  const totalBalance = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
  const favoriteAccount = accounts.find(a => a.is_favorite);

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
          <button className="btn btn-secondary" onClick={() => openTransactionModal()}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            Gelir/Gider
          </button>
          <button className="btn btn-secondary" onClick={() => openCardPaymentModal()}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
            </svg>
            Kart Öde
          </button>
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
        {favoriteAccount && (
          <div className="text-muted" style={{ marginTop: 'var(--spacing-sm)', fontSize: '0.875rem' }}>
            ★ Favori: {favoriteAccount.name} ({formatCurrency(favoriteAccount.balance)})
          </div>
        )}
      </div>

      {/* Credit Cards Summary - Quick Pay */}
      {cards.length > 0 && (
        <div className="card mb-xl">
          <div className="card-header">
            <h2 className="card-title">Kart Borçları</h2>
          </div>
          <div className="grid grid-3" style={{ gap: 'var(--spacing-md)' }}>
          {cards.filter(c => c.current_debt > 0).map(card => {
              // Calculate due date based on earliest unpaid transaction
              const unpaidTx = (card.card_transactions || []).filter(t => !t.is_paid);
              let dueDate;
              if (unpaidTx.length > 0) {
                const earliestTx = unpaidTx.reduce((earliest, t) => {
                  const txDate = new Date(t.transaction_date);
                  return txDate < earliest ? txDate : earliest;
                }, new Date(unpaidTx[0].transaction_date));
                const statementDate = calculateStatementDateForTransaction(card.statement_day, earliestTx);
                dueDate = new Date(statementDate);
                dueDate.setDate(dueDate.getDate() + 10);
              } else {
                dueDate = calculateDueDate(card.statement_day);
              }
              
              return (
              <div 
                key={card.id} 
                style={{ 
                  padding: 'var(--spacing-md)',
                  background: 'var(--bg-glass)',
                  borderRadius: 'var(--border-radius-md)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div className="font-medium">{card.name}</div>
                  <div className="text-danger font-bold">{formatCurrency(card.current_debt)}</div>
                  <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                    Son ödeme: {formatDate(dueDate, 'dd MMM')}
                  </div>
                </div>
                <button 
                  className="btn btn-primary"
                  onClick={() => openCardPaymentModal(card)}
                >
                  Öde
                </button>
              </div>
            )})}
          </div>
        </div>
      )}

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
                  <button className="btn btn-ghost btn-icon" onClick={() => openTransactionModal(account)} title="Gelir/Gider Ekle">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                  </button>
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
                  <th>Açıklama</th>
                  <th>Tür</th>
                  <th className="text-right">Tutar</th>
                  <th className="text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 10).map(tx => {
                  const account = accounts.find(a => a.id === tx.account_id);
                  return (
                    <tr key={tx.id}>
                      <td>{formatDate(tx.transaction_date, 'dd MMM yyyy')}</td>
                      <td>{account?.name || '-'}</td>
                      <td>{tx.description}</td>
                      <td>
                        <span className={`badge ${tx.type === 'income' ? 'badge-success' : 'badge-danger'}`}>
                          {tx.type === 'income' ? 'Gelir' : 'Gider'}
                        </span>
                      </td>
                      <td className={`text-right font-bold ${tx.type === 'income' ? 'text-success' : 'text-danger'}`}>
                        {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                      </td>
                      <td className="text-right">
                        <div className="flex gap-xs justify-end">
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
              <span>Favori hesap olarak işaretle (kart ödemeleri için)</span>
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

      {/* Transaction Modal (Income/Expense) */}
      <Modal 
        isOpen={transactionModalOpen} 
        onClose={() => { setTransactionModalOpen(false); setEditingTransaction(null); }}
        title={editingTransaction ? 'İşlem Düzenle' : 'Gelir / Gider Ekle'}
      >
        <form onSubmit={editingTransaction ? handleUpdateTransaction : handleTransaction}>
          <div className="form-group">
            <label className="form-label">Hesap *</label>
            <select
              className="form-select"
              value={transactionData.account_id}
              onChange={(e) => setTransactionData({ ...transactionData, account_id: e.target.value })}
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
            <label className="form-label">İşlem Türü</label>
            <div className="flex gap-md">
              <button
                type="button"
                className={`btn ${transactionData.type === 'income' ? 'btn-success' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setTransactionData({ ...transactionData, type: 'income' })}
              >
                ↓ Gelir
              </button>
              <button
                type="button"
                className={`btn ${transactionData.type === 'expense' ? 'btn-danger' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setTransactionData({ ...transactionData, type: 'expense' })}
              >
                ↑ Gider
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Açıklama *</label>
            <input
              type="text"
              className="form-input"
              value={transactionData.description}
              onChange={(e) => setTransactionData({ ...transactionData, description: e.target.value })}
              placeholder="Örn: Maaş, Market alışverişi"
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
                value={transactionData.amount}
                onChange={(e) => setTransactionData({ ...transactionData, amount: e.target.value })}
                placeholder="0.00"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Tarih</label>
              <input
                type="date"
                className="form-input"
                value={transactionData.transaction_date}
                onChange={(e) => setTransactionData({ ...transactionData, transaction_date: e.target.value })}
              />
            </div>
          </div>

          <div className="modal-footer" style={{ padding: 0, marginTop: 'var(--spacing-lg)', borderTop: 'none' }}>
            <button type="button" className="btn btn-secondary" onClick={() => { setTransactionModalOpen(false); setEditingTransaction(null); }}>
              İptal
            </button>
            <button type="submit" className={`btn ${transactionData.type === 'income' ? 'btn-success' : 'btn-danger'}`}>
              {editingTransaction 
                ? 'Güncelle' 
                : (transactionData.type === 'income' ? 'Gelir Ekle' : 'Gider Ekle')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Card Payment Modal */}
      <Modal 
        isOpen={cardPaymentModalOpen} 
        onClose={() => setCardPaymentModalOpen(false)}
        title="Kredi Kartı Ödemesi"
      >
        <form onSubmit={handleCardPayment}>
          <div className="form-group">
            <label className="form-label">Kredi Kartı *</label>
            <select
              className="form-select"
              value={cardPaymentData.card_id}
              onChange={(e) => {
                const card = cards.find(c => c.id === e.target.value);
                setCardPaymentData({ 
                  ...cardPaymentData, 
                  card_id: e.target.value,
                  amount: card?.current_debt?.toString() || '',
                  description: card ? `${card.name} kart ödemesi` : 'Kart ödemesi'
                });
              }}
              required
            >
              <option value="">Kart seçin</option>
              {cards.map(card => (
                <option key={card.id} value={card.id}>
                  {card.name} - Borç: {formatCurrency(card.current_debt)}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Ödeme Yapılacak Hesap *</label>
            <select
              className="form-select"
              value={cardPaymentData.account_id}
              onChange={(e) => setCardPaymentData({ ...cardPaymentData, account_id: e.target.value })}
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

          <div className="grid grid-2">
            <div className="form-group">
              <label className="form-label">Ödeme Tutarı *</label>
              <input
                type="number"
                step="0.01"
                className="form-input"
                value={cardPaymentData.amount}
                onChange={(e) => setCardPaymentData({ ...cardPaymentData, amount: e.target.value })}
                placeholder="0.00"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Ödeme Tarihi</label>
              <input
                type="date"
                className="form-input"
                value={cardPaymentData.payment_date}
                onChange={(e) => setCardPaymentData({ ...cardPaymentData, payment_date: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Açıklama</label>
            <input
              type="text"
              className="form-input"
              value={cardPaymentData.description}
              onChange={(e) => setCardPaymentData({ ...cardPaymentData, description: e.target.value })}
              placeholder="Kart ödemesi açıklaması"
            />
          </div>

          <div className="modal-footer" style={{ padding: 0, marginTop: 'var(--spacing-lg)', borderTop: 'none' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setCardPaymentModalOpen(false)}>
              İptal
            </button>
            <button type="submit" className="btn btn-primary">
              Ödeme Yap
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
