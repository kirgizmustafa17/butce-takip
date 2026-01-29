'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import { fetchMultiplePrices, calculateProfitLoss, INVESTMENT_TYPES } from '@/lib/priceApi';
import { useToast } from '@/components/ui/Toast';
import Modal from '@/components/ui/Modal';

export default function YatirimlarPage() {
  const [investments, setInvestments] = useState([]);
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [pricesLoading, setPricesLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingInvestment, setEditingInvestment] = useState(null);
  const { addToast } = useToast();

  // Form state
  const [formData, setFormData] = useState({
    type: 'XAU',
    name: '',
    quantity: '',
    purchase_price: '',
    purchase_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  useEffect(() => {
    fetchInvestments();
    fetchPrices();
  }, []);

  async function fetchInvestments() {
    setLoading(true);
    const { data, error } = await supabase
      .from('investments')
      .select('*')
      .order('type')
      .order('created_at', { ascending: false });

    if (error) {
      addToast('Yatırımlar yüklenirken hata oluştu', 'error');
    } else {
      setInvestments(data || []);
    }
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

  function openAddModal() {
    setEditingInvestment(null);
    setFormData({
      type: 'XAU',
      name: '',
      quantity: '',
      purchase_price: '',
      purchase_date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setModalOpen(true);
  }

  function openEditModal(investment) {
    setEditingInvestment(investment);
    setFormData({
      type: investment.type,
      name: investment.name,
      quantity: investment.quantity.toString(),
      purchase_price: investment.purchase_price.toString(),
      purchase_date: investment.purchase_date,
      notes: investment.notes || '',
    });
    setModalOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const investmentData = {
      type: formData.type,
      name: formData.name,
      quantity: parseFloat(formData.quantity) || 0,
      purchase_price: parseFloat(formData.purchase_price) || 0,
      purchase_date: formData.purchase_date,
      notes: formData.notes,
    };

    let error;

    if (editingInvestment) {
      const result = await supabase
        .from('investments')
        .update(investmentData)
        .eq('id', editingInvestment.id);
      error = result.error;
    } else {
      const result = await supabase
        .from('investments')
        .insert([investmentData]);
      error = result.error;
    }

    if (error) {
      addToast('İşlem başarısız: ' + error.message, 'error');
    } else {
      addToast(editingInvestment ? 'Yatırım güncellendi' : 'Yatırım eklendi', 'success');
      setModalOpen(false);
      fetchInvestments();
    }
  }

  async function handleDelete(id) {
    if (!confirm('Bu yatırımı silmek istediğinizden emin misiniz?')) return;

    const { error } = await supabase
      .from('investments')
      .delete()
      .eq('id', id);

    if (error) {
      addToast('Silme işlemi başarısız', 'error');
    } else {
      addToast('Yatırım silindi', 'success');
      fetchInvestments();
    }
  }

  // Group investments by type
  const groupedInvestments = investments.reduce((acc, inv) => {
    if (!acc[inv.type]) acc[inv.type] = [];
    acc[inv.type].push(inv);
    return acc;
  }, {});

  // Calculate totals
  let totalCost = 0;
  let totalValue = 0;

  investments.forEach(inv => {
    const currentPrice = prices[inv.type] || inv.purchase_price;
    totalCost += inv.quantity * inv.purchase_price;
    totalValue += inv.quantity * currentPrice;
  });

  const totalProfitLoss = totalValue - totalCost;
  const totalProfitLossPercent = totalCost > 0 ? (totalProfitLoss / totalCost) * 100 : 0;

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="flex justify-between items-center mb-xl">
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 'var(--spacing-xs)' }}>
            Yatırımlar
          </h1>
          <p className="text-secondary">Altın, gümüş ve döviz yatırımlarınızı takip edin</p>
        </div>
        <div className="flex gap-md">
          <button className="btn btn-secondary" onClick={fetchPrices} disabled={pricesLoading}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18" style={{ animation: pricesLoading ? 'spin 1s linear infinite' : 'none' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            Fiyatları Güncelle
          </button>
          <button className="btn btn-primary" onClick={openAddModal}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Yatırım Ekle
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

      {/* Current Prices */}
      <div className="card mb-xl">
        <div className="card-header">
          <h2 className="card-title">Güncel Fiyatlar</h2>
          <span className="text-muted" style={{ fontSize: '0.75rem' }}>
            Son güncelleme: {new Date().toLocaleTimeString('tr-TR')}
          </span>
        </div>
        <div className="grid grid-4" style={{ padding: 0 }}>
          {Object.entries(INVESTMENT_TYPES).map(([code, info]) => (
            <div 
              key={code} 
              style={{ 
                padding: 'var(--spacing-md)',
                background: 'var(--bg-glass)',
                borderRadius: 'var(--border-radius-md)',
                textAlign: 'center'
              }}
            >
              <div className="text-secondary" style={{ fontSize: '0.875rem' }}>{info.name}</div>
              <div className="font-bold" style={{ fontSize: '1.25rem', marginTop: 'var(--spacing-xs)' }}>
                {prices[code] ? formatCurrency(prices[code]) : '...'}
              </div>
              <div className="text-muted" style={{ fontSize: '0.75rem' }}>/ {info.unit}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Investments */}
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
      ) : investments.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📈</div>
            <h3 className="empty-state-title">Henüz yatırım yok</h3>
            <p>İlk yatırımınızı ekleyerek portföyünüzü oluşturun</p>
            <button className="btn btn-primary mt-lg" onClick={openAddModal}>
              Yatırım Ekle
            </button>
          </div>
        </div>
      ) : (
        <div>
          {Object.entries(groupedInvestments).map(([type, items]) => {
            const typeInfo = INVESTMENT_TYPES[type] || { name: type, unit: 'adet' };
            const currentPrice = prices[type];

            // Calculate type totals
            const typeTotal = items.reduce((acc, inv) => {
              acc.quantity += inv.quantity;
              acc.cost += inv.quantity * inv.purchase_price;
              acc.value += inv.quantity * (currentPrice || inv.purchase_price);
              return acc;
            }, { quantity: 0, cost: 0, value: 0 });

            const typeProfitLoss = typeTotal.value - typeTotal.cost;

            return (
              <div key={type} className="mb-xl">
                <div className="flex items-center gap-md mb-md">
                  <div className={`investment-icon ${type.toLowerCase()}`} style={{ width: 40, height: 40 }}>
                    {type === 'XAU' && '🪙'}
                    {type === 'XAG' && '🥈'}
                    {type === 'USD' && '$'}
                    {type === 'EUR' && '€'}
                    {type === 'GBP' && '£'}
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
                  {items.map(inv => {
                    const profitLoss = calculateProfitLoss(inv.quantity, inv.purchase_price, currentPrice || inv.purchase_price);

                    return (
                      <div key={inv.id} className="card">
                        <div className="flex justify-between items-start mb-md">
                          <div>
                            <h4 className="font-medium">{inv.name}</h4>
                            <div className="text-secondary" style={{ fontSize: '0.875rem' }}>
                              {formatDate(inv.purchase_date, 'dd MMM yyyy')}
                            </div>
                          </div>
                          <div className="flex gap-sm">
                            <button className="btn btn-ghost btn-icon" onClick={() => openEditModal(inv)}>
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                              </svg>
                            </button>
                            <button className="btn btn-ghost btn-icon text-danger" onClick={() => handleDelete(inv.id)}>
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="18" height="18">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-2 gap-md">
                          <div>
                            <div className="text-muted" style={{ fontSize: '0.75rem' }}>Miktar</div>
                            <div className="font-medium">{inv.quantity} {typeInfo.unit}</div>
                          </div>
                          <div>
                            <div className="text-muted" style={{ fontSize: '0.75rem' }}>Alış Fiyatı</div>
                            <div className="font-medium">{formatCurrency(inv.purchase_price)} / {typeInfo.unit}</div>
                          </div>
                          <div>
                            <div className="text-muted" style={{ fontSize: '0.75rem' }}>Maliyet</div>
                            <div className="font-medium">{formatCurrency(profitLoss.totalCost)}</div>
                          </div>
                          <div>
                            <div className="text-muted" style={{ fontSize: '0.75rem' }}>Güncel Değer</div>
                            <div className="font-medium">{formatCurrency(profitLoss.currentValue)}</div>
                          </div>
                        </div>

                        <div 
                          className={`mt-md ${profitLoss.isProfit ? 'text-success' : 'text-danger'}`}
                          style={{ 
                            padding: 'var(--spacing-sm) var(--spacing-md)',
                            background: profitLoss.isProfit ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            borderRadius: 'var(--border-radius-sm)',
                            textAlign: 'center'
                          }}
                        >
                          <span className="font-bold">
                            {profitLoss.isProfit ? '+' : ''}{formatCurrency(profitLoss.profitLoss)}
                          </span>
                          <span style={{ marginLeft: 'var(--spacing-sm)' }}>
                            ({profitLoss.profitLossPercent >= 0 ? '+' : ''}{profitLoss.profitLossPercent.toFixed(2)}%)
                          </span>
                        </div>

                        {inv.notes && (
                          <div className="text-muted mt-md" style={{ fontSize: '0.875rem', fontStyle: 'italic' }}>
                            {inv.notes}
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

      {/* Add/Edit Modal */}
      <Modal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)}
        title={editingInvestment ? 'Yatırım Düzenle' : 'Yeni Yatırım Ekle'}
      >
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Yatırım Türü *</label>
            <select
              className="form-select"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              required
            >
              {Object.entries(INVESTMENT_TYPES).map(([code, info]) => (
                <option key={code} value={code}>{info.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Yatırım Adı *</label>
            <input
              type="text"
              className="form-input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Örn: Gram Altın - Ocak 2024"
              required
            />
          </div>

          <div className="grid grid-2">
            <div className="form-group">
              <label className="form-label">Miktar *</label>
              <input
                type="number"
                step="0.0001"
                className="form-input"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                placeholder="10.5"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Birim Alış Fiyatı (₺) *</label>
              <input
                type="number"
                step="0.01"
                className="form-input"
                value={formData.purchase_price}
                onChange={(e) => setFormData({ ...formData, purchase_price: e.target.value })}
                placeholder="2850.00"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Alış Tarihi</label>
            <input
              type="date"
              className="form-input"
              value={formData.purchase_date}
              onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Notlar</label>
            <textarea
              className="form-input"
              rows="3"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Opsiyonel notlar..."
            ></textarea>
          </div>

          {formData.quantity && formData.purchase_price && (
            <div className="stat-card" style={{ marginTop: 'var(--spacing-md)' }}>
              <div className="text-secondary" style={{ fontSize: '0.875rem' }}>Toplam Maliyet</div>
              <div className="font-bold" style={{ fontSize: '1.25rem' }}>
                {formatCurrency(parseFloat(formData.quantity) * parseFloat(formData.purchase_price))}
              </div>
            </div>
          )}

          <div className="modal-footer" style={{ padding: 0, marginTop: 'var(--spacing-lg)', borderTop: 'none' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>
              İptal
            </button>
            <button type="submit" className="btn btn-primary">
              {editingInvestment ? 'Güncelle' : 'Ekle'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
