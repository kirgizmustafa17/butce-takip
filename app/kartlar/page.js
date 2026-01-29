'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate, calculateDueDate, calculateNextStatementDate, calculateStatementDateForTransaction, calculateInstallmentDetails } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import Modal from '@/components/ui/Modal';

export default function KartlarPage() {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [editingCard, setEditingCard] = useState(null);
  const { addToast } = useToast();

  // Card form state
  const [cardForm, setCardForm] = useState({
    name: '',
    bank_name: '',
    total_limit: '',
    statement_day: '',
    currency: 'TRY',
  });

  // Transaction form state
  const [transactionForm, setTransactionForm] = useState({
    card_id: '',
    description: '',
    amount: '',
    transaction_date: new Date().toISOString().split('T')[0],
    installments: 1,
  });

  useEffect(() => {
    fetchCards();
  }, []);

  async function fetchCards() {
    setLoading(true);
    const { data, error } = await supabase
      .from('credit_cards')
      .select('*, card_transactions(*)')
      .order('name');

    if (error) {
      addToast('Kartlar yüklenirken hata oluştu', 'error');
    } else {
      // Calculate used limit from unpaid transactions
      const cardsWithCalculatedLimits = (data || []).map(card => {
        const unpaidTransactions = (card.card_transactions || []).filter(t => !t.is_paid);
        const usedLimit = unpaidTransactions.reduce((sum, t) => sum + t.amount, 0);
        return { ...card, used_limit: usedLimit };
      });
      setCards(cardsWithCalculatedLimits);
    }
    setLoading(false);
  }

  function openAddCardModal() {
    setEditingCard(null);
    setCardForm({
      name: '',
      bank_name: '',
      total_limit: '',
      statement_day: '',
      currency: 'TRY',
    });
    setCardModalOpen(true);
  }

  function openEditCardModal(card) {
    setEditingCard(card);
    setCardForm({
      name: card.name,
      bank_name: card.bank_name,
      total_limit: card.total_limit.toString(),
      statement_day: card.statement_day.toString(),
      currency: card.currency,
    });
    setCardModalOpen(true);
  }

  function openTransactionModal(card = null) {
    setTransactionForm({
      card_id: card?.id || '',
      description: '',
      amount: '',
      transaction_date: new Date().toISOString().split('T')[0],
      installments: 1,
    });
    setTransactionModalOpen(true);
  }

  function openDetailModal(card) {
    setSelectedCard(card);
    setDetailModalOpen(true);
  }

  async function handleCardSubmit(e) {
    e.preventDefault();

    const cardData = {
      name: cardForm.name,
      bank_name: cardForm.bank_name,
      total_limit: parseFloat(cardForm.total_limit) || 0,
      statement_day: parseInt(cardForm.statement_day) || 1,
      currency: cardForm.currency,
    };

    let error;

    if (editingCard) {
      const result = await supabase
        .from('credit_cards')
        .update(cardData)
        .eq('id', editingCard.id);
      error = result.error;
    } else {
      const result = await supabase
        .from('credit_cards')
        .insert([cardData]);
      error = result.error;
    }

    if (error) {
      addToast('İşlem başarısız: ' + error.message, 'error');
    } else {
      addToast(editingCard ? 'Kart güncellendi' : 'Kart eklendi', 'success');
      setCardModalOpen(false);
      fetchCards();
    }
  }

  async function handleTransactionSubmit(e) {
    e.preventDefault();

    const transactionData = {
      card_id: transactionForm.card_id,
      description: transactionForm.description,
      amount: parseFloat(transactionForm.amount) || 0,
      transaction_date: transactionForm.transaction_date,
      installments: parseInt(transactionForm.installments) || 1,
      current_installment: 1,
      is_paid: false,
    };

    const { error } = await supabase
      .from('card_transactions')
      .insert([transactionData]);

    if (error) {
      addToast('İşlem eklenemedi: ' + error.message, 'error');
    } else {
      addToast('Harcama eklendi', 'success');
      setTransactionModalOpen(false);
      fetchCards();
    }
  }

  async function handleDeleteCard(id) {
    if (!confirm('Bu kartı silmek istediğinizden emin misiniz? Tüm harcama kayıtları da silinecek.')) return;

    const { error } = await supabase
      .from('credit_cards')
      .delete()
      .eq('id', id);

    if (error) {
      addToast('Silme işlemi başarısız', 'error');
    } else {
      addToast('Kart silindi', 'success');
      fetchCards();
    }
  }

  async function handlePayTransaction(transactionId) {
    const { error } = await supabase
      .from('card_transactions')
      .update({ is_paid: true })
      .eq('id', transactionId);

    if (!error) {
      addToast('Ödeme olarak işaretlendi', 'success');
      fetchCards();
    }
  }

  async function handleDeleteTransaction(transactionId) {
    if (!confirm('Bu harcamayı silmek istediğinizden emin misiniz?')) return;

    const { error } = await supabase
      .from('card_transactions')
      .delete()
      .eq('id', transactionId);

    if (!error) {
      addToast('Harcama silindi', 'success');
      fetchCards();
    }
  }

  // Calculate current period debt for a card
  function calculatePeriodDebt(card) {
    const unpaidTransactions = (card.card_transactions || []).filter(t => !t.is_paid);
    let periodDebt = 0;

    unpaidTransactions.forEach(t => {
      if (t.installments > 1) {
        // For installment purchases, add monthly payment
        periodDebt += t.amount / t.installments;
      } else {
        periodDebt += t.amount;
      }
    });

    return periodDebt;
  }

  // Calculate statement date based on earliest unpaid transaction
  function getCardStatementDate(card) {
    const unpaidTransactions = (card.card_transactions || []).filter(t => !t.is_paid);
    
    if (unpaidTransactions.length === 0) {
      // No unpaid transactions, use default calculation
      return calculateNextStatementDate(card.statement_day);
    }
    
    // Find earliest transaction date
    const earliestTx = unpaidTransactions.reduce((earliest, t) => {
      const txDate = new Date(t.transaction_date);
      return txDate < earliest ? txDate : earliest;
    }, new Date(unpaidTransactions[0].transaction_date));
    
    // Calculate statement date for that transaction
    return calculateStatementDateForTransaction(card.statement_day, earliestTx);
  }

  const totalDebt = cards.reduce((sum, card) => sum + (card.used_limit || 0), 0);
  const totalLimit = cards.reduce((sum, card) => sum + card.total_limit, 0);

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="flex justify-between items-center mb-xl">
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 'var(--spacing-xs)' }}>
            Kredi Kartları
          </h1>
          <p className="text-secondary">Kartlarınızı ve harcamalarınızı takip edin</p>
        </div>
        <div className="flex gap-md">
          <button className="btn btn-secondary" onClick={() => openTransactionModal()}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
            </svg>
            Harcama Ekle
          </button>
          <button className="btn btn-primary" onClick={openAddCardModal}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Kart Ekle
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-3 mb-xl">
        <div className="stat-card">
          <div className="stat-label">Toplam Limit</div>
          <div className="stat-value">{formatCurrency(totalLimit)}</div>
        </div>
        <div className="stat-card danger">
          <div className="stat-label">Toplam Borç</div>
          <div className="stat-value text-danger">{formatCurrency(totalDebt)}</div>
        </div>
        <div className="stat-card success">
          <div className="stat-label">Kullanılabilir Limit</div>
          <div className="stat-value text-success">{formatCurrency(totalLimit - totalDebt)}</div>
        </div>
      </div>

      {/* Cards Grid */}
      {loading ? (
        <div className="grid grid-2">
          {[1, 2].map(i => (
            <div key={i} className="card">
              <div className="skeleton" style={{ height: 180, borderRadius: 'var(--border-radius-lg)', marginBottom: 'var(--spacing-md)' }}></div>
              <div className="skeleton" style={{ height: 20, width: '60%' }}></div>
            </div>
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">💳</div>
            <h3 className="empty-state-title">Henüz kart yok</h3>
            <p>İlk kredi kartınızı ekleyerek başlayın</p>
            <button className="btn btn-primary mt-lg" onClick={openAddCardModal}>
              Kart Ekle
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-2">
          {cards.map((card) => {
            const usagePercent = ((card.used_limit || 0) / card.total_limit) * 100;
            // Calculate statement date based on earliest unpaid transaction
            const statementDate = getCardStatementDate(card);
            // Calculate due date: statement date + 10 days
            const dueDate = new Date(statementDate);
            dueDate.setDate(dueDate.getDate() + 10);
            const periodDebt = calculatePeriodDebt(card);

            return (
              <div key={card.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Visual Card */}
                <div className="credit-card-visual">
                  <div className="flex justify-between items-start">
                    <div>
                      <div style={{ fontSize: '0.875rem', opacity: 0.8 }}>{card.bank_name}</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: 4 }}>{card.name}</div>
                    </div>
                    <div className="flex gap-sm">
                      <button 
                        className="btn btn-ghost btn-icon" 
                        style={{ color: 'white' }}
                        onClick={() => openEditCardModal(card)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                        </svg>
                      </button>
                      <button 
                        className="btn btn-ghost btn-icon" 
                        style={{ color: 'white' }}
                        onClick={() => handleDeleteCard(card.id)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div className="credit-card-limit">
                    <div className="flex justify-between mb-sm">
                      <span style={{ opacity: 0.8 }}>Kullanılan</span>
                      <span style={{ fontWeight: 600 }}>
                        {formatCurrency(card.used_limit || 0)} / {formatCurrency(card.total_limit)}
                      </span>
                    </div>
                    <div className="progress" style={{ background: 'rgba(255,255,255,0.2)' }}>
                      <div 
                        className={`progress-bar ${usagePercent > 80 ? 'danger' : ''}`}
                        style={{ 
                          width: `${Math.min(usagePercent, 100)}%`,
                          background: usagePercent > 80 ? 'var(--accent-danger)' : 'white'
                        }}
                      ></div>
                    </div>
                  </div>

                  <div className="credit-card-dates">
                    <div>
                      <div style={{ opacity: 0.7, fontSize: '0.75rem' }}>Hesap Kesim</div>
                      <div style={{ fontWeight: 500 }}>{formatDate(statementDate, 'dd MMMM')}</div>
                    </div>
                    <div>
                      <div style={{ opacity: 0.7, fontSize: '0.75rem' }}>Son Ödeme</div>
                      <div style={{ fontWeight: 500 }}>{formatDate(dueDate, 'dd MMMM')}</div>
                    </div>
                  </div>
                </div>

                {/* Card Footer */}
                <div style={{ padding: 'var(--spacing-lg)' }}>
                  <div className="flex justify-between items-center mb-md">
                    <div>
                      <div className="text-secondary" style={{ fontSize: '0.875rem' }}>Dönem Borcu</div>
                      <div className="font-bold text-danger" style={{ fontSize: '1.25rem' }}>
                        {formatCurrency(periodDebt)}
                      </div>
                    </div>
                    <div className="flex gap-sm">
                      <button 
                        className="btn btn-secondary"
                        onClick={() => openDetailModal(card)}
                      >
                        Detaylar
                      </button>
                      <button 
                        className="btn btn-primary"
                        onClick={() => openTransactionModal(card)}
                      >
                        Harcama Ekle
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Card Modal */}
      <Modal 
        isOpen={cardModalOpen} 
        onClose={() => setCardModalOpen(false)}
        title={editingCard ? 'Kart Düzenle' : 'Yeni Kart Ekle'}
      >
        <form onSubmit={handleCardSubmit}>
          <div className="form-group">
            <label className="form-label">Kart Adı *</label>
            <input
              type="text"
              className="form-input"
              value={cardForm.name}
              onChange={(e) => setCardForm({ ...cardForm, name: e.target.value })}
              placeholder="Örn: Gold Kart"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Banka *</label>
            <input
              type="text"
              className="form-input"
              value={cardForm.bank_name}
              onChange={(e) => setCardForm({ ...cardForm, bank_name: e.target.value })}
              placeholder="Örn: Garanti BBVA"
              required
            />
          </div>

          <div className="grid grid-2">
            <div className="form-group">
              <label className="form-label">Toplam Limit *</label>
              <input
                type="number"
                step="0.01"
                className="form-input"
                value={cardForm.total_limit}
                onChange={(e) => setCardForm({ ...cardForm, total_limit: e.target.value })}
                placeholder="50000"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Hesap Kesim Günü *</label>
              <input
                type="number"
                min="1"
                max="31"
                className="form-input"
                value={cardForm.statement_day}
                onChange={(e) => setCardForm({ ...cardForm, statement_day: e.target.value })}
                placeholder="15"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Para Birimi</label>
            <select
              className="form-select"
              value={cardForm.currency}
              onChange={(e) => setCardForm({ ...cardForm, currency: e.target.value })}
            >
              <option value="TRY">TRY - Türk Lirası</option>
              <option value="USD">USD - Amerikan Doları</option>
              <option value="EUR">EUR - Euro</option>
            </select>
          </div>

          <div className="modal-footer" style={{ padding: 0, marginTop: 'var(--spacing-lg)', borderTop: 'none' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setCardModalOpen(false)}>
              İptal
            </button>
            <button type="submit" className="btn btn-primary">
              {editingCard ? 'Güncelle' : 'Ekle'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Transaction Modal */}
      <Modal 
        isOpen={transactionModalOpen} 
        onClose={() => setTransactionModalOpen(false)}
        title="Harcama Ekle"
      >
        <form onSubmit={handleTransactionSubmit}>
          <div className="form-group">
            <label className="form-label">Kart *</label>
            <select
              className="form-select"
              value={transactionForm.card_id}
              onChange={(e) => setTransactionForm({ ...transactionForm, card_id: e.target.value })}
              required
            >
              <option value="">Kart seçin</option>
              {cards.map(card => (
                <option key={card.id} value={card.id}>
                  {card.name} ({card.bank_name})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Açıklama *</label>
            <input
              type="text"
              className="form-input"
              value={transactionForm.description}
              onChange={(e) => setTransactionForm({ ...transactionForm, description: e.target.value })}
              placeholder="Örn: Market alışverişi"
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
                value={transactionForm.amount}
                onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
                placeholder="0.00"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Taksit Sayısı</label>
              <select
                className="form-select"
                value={transactionForm.installments}
                onChange={(e) => setTransactionForm({ ...transactionForm, installments: parseInt(e.target.value) })}
              >
                <option value="1">Tek Çekim</option>
                <option value="2">2 Taksit</option>
                <option value="3">3 Taksit</option>
                <option value="6">6 Taksit</option>
                <option value="9">9 Taksit</option>
                <option value="12">12 Taksit</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">İşlem Tarihi</label>
            <input
              type="date"
              className="form-input"
              value={transactionForm.transaction_date}
              onChange={(e) => setTransactionForm({ ...transactionForm, transaction_date: e.target.value })}
            />
          </div>

          {transactionForm.installments > 1 && transactionForm.amount && (
            <div className="stat-card" style={{ marginTop: 'var(--spacing-md)' }}>
              <div className="text-secondary" style={{ fontSize: '0.875rem' }}>Aylık Taksit</div>
              <div className="font-bold" style={{ fontSize: '1.25rem' }}>
                {formatCurrency(parseFloat(transactionForm.amount) / transactionForm.installments)}
              </div>
              <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                x {transactionForm.installments} ay
              </div>
            </div>
          )}

          <div className="modal-footer" style={{ padding: 0, marginTop: 'var(--spacing-lg)', borderTop: 'none' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setTransactionModalOpen(false)}>
              İptal
            </button>
            <button type="submit" className="btn btn-primary">
              Ekle
            </button>
          </div>
        </form>
      </Modal>

      {/* Card Detail Modal */}
      <Modal 
        isOpen={detailModalOpen} 
        onClose={() => setDetailModalOpen(false)}
        title={selectedCard?.name || 'Kart Detayları'}
        size="lg"
      >
        {selectedCard && (
          <div>
            <div className="mb-lg">
              <h4 className="font-semibold mb-md">Harcamalar</h4>
              {(selectedCard.card_transactions || []).length === 0 ? (
                <p className="text-secondary">Henüz harcama yok</p>
              ) : (
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Açıklama</th>
                        <th>Tarih</th>
                        <th>Tutar</th>
                        <th>Taksit</th>
                        <th>Durum</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCard.card_transactions.map(t => {
                        const installmentInfo = t.installments > 1 
                          ? calculateInstallmentDetails(t.amount, t.installments, t.current_installment)
                          : null;

                        return (
                          <tr key={t.id}>
                            <td>{t.description}</td>
                            <td>{formatDate(t.transaction_date, 'dd MMM yyyy')}</td>
                            <td className="font-bold">
                              {formatCurrency(t.amount)}
                              {installmentInfo && (
                                <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                                  Aylık: {formatCurrency(installmentInfo.monthlyPayment)}
                                </div>
                              )}
                            </td>
                            <td>
                              {t.installments > 1 ? (
                                <span className="badge badge-info">
                                  {t.current_installment}/{t.installments}
                                </span>
                              ) : (
                                <span className="text-muted">-</span>
                              )}
                            </td>
                            <td>
                              {t.is_paid ? (
                                <span className="badge badge-success">Ödendi</span>
                              ) : (
                                <span className="badge badge-warning">Bekliyor</span>
                              )}
                            </td>
                            <td>
                              <div className="flex gap-sm">
                                {!t.is_paid && (
                                  <button 
                                    className="btn btn-ghost btn-icon"
                                    onClick={() => handlePayTransaction(t.id)}
                                    title="Ödendi olarak işaretle"
                                  >
                                    ✓
                                  </button>
                                )}
                                <button 
                                  className="btn btn-ghost btn-icon text-danger"
                                  onClick={() => handleDeleteTransaction(t.id)}
                                  title="Sil"
                                >
                                  ✕
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
