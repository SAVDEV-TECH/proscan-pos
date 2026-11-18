'use client';

import { useState, useMemo } from 'react';
import { useCart, PosReceipt } from '@/context/CartContext';
import { isRealImage } from '@/lib/products';
import { playCheckoutChime, speakPosAnnouncement } from '@/lib/audio';

export function CartSummary() {
  const { items, total: subtotal, itemCount, updateQuantity, removeItem, clearCart, salesHistory, recordSale } = useCart();
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'POS Card' | 'Cash' | 'Transfer'>('POS Card');
  const [memberDiscountOn, setMemberDiscountOn] = useState(false);
  const [taxEnabled, setTaxEnabled] = useState(true);
  const [cashTendered, setCashTendered] = useState<number | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<PosReceipt | null>(null);

  const discountAmount = useMemo(
    () => (memberDiscountOn ? Number((subtotal * 0.1).toFixed(2)) : 0),
    [subtotal, memberDiscountOn]
  );

  const taxableAmount = Math.max(0, subtotal - discountAmount);

  const taxAmount = useMemo(
    () => (taxEnabled ? Number((taxableAmount * 0.075).toFixed(2)) : 0),
    [taxableAmount, taxEnabled]
  );

  const finalTotal = useMemo(
    () => Number((taxableAmount + taxAmount).toFixed(2)),
    [taxableAmount, taxAmount]
  );

  const effectiveTendered = useMemo(() => {
    if (paymentMethod !== 'Cash') return finalTotal;
    if (cashTendered === null || cashTendered < finalTotal) return finalTotal;
    return cashTendered;
  }, [paymentMethod, cashTendered, finalTotal]);

  const changeDue = useMemo(
    () => Number(Math.max(0, effectiveTendered - finalTotal).toFixed(2)),
    [effectiveTendered, finalTotal]
  );

  const quickCashOptions = useMemo(() => {
    const bills = [5, 10, 20, 50, 100].filter((b) => b >= finalTotal);
    return bills.slice(0, 4);
  }, [finalTotal]);

  const shiftRevenue = useMemo(
    () => salesHistory.reduce((acc, r) => acc + r.total, 0),
    [salesHistory]
  );

  const handleCheckout = async () => {
    if (items.length === 0 || isProcessingPayment) return;

    if (paymentMethod !== 'Cash') {
      setIsProcessingPayment(true);
      await new Promise((r) => setTimeout(r, 650));
      setIsProcessingPayment(false);
    }

    const now = new Date();
    const receipt: PosReceipt = {
      id: `POS-${Math.floor(100000 + Math.random() * 900000)}`,
      date: now.toLocaleDateString([], { month: 'short', day: '2-digit', year: 'numeric' }),
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      cashier: 'Term #04 • Cashier Alex',
      method: paymentMethod,
      items: [...items],
      subtotal,
      discount: discountAmount,
      tax: taxAmount,
      total: finalTotal,
      amountTendered: effectiveTendered,
      changeDue,
    };

    playCheckoutChime();
    speakPosAnnouncement(
      `Payment of $${finalTotal.toFixed(2)} approved. ${
        paymentMethod === 'Cash' && changeDue > 0 ? `Change due $${changeDue.toFixed(2)}.` : ''
      } Thank you for shopping at Proscan!`
    );

    recordSale(receipt);
    setLastReceipt(receipt);
    setMobileDrawerOpen(false);
    setReceiptOpen(true);
    setCashTendered(null);
    setMemberDiscountOn(false);
    clearCart();
  };

  const renderCartItemsAndControls = () => (
    <>
      <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex flex-col xs:flex-row xs:items-center justify-between gap-2 bg-slate-50 p-2.5 sm:p-3 rounded-xl border border-slate-200"
          >
            <div className="flex items-center space-x-2.5 min-w-0 flex-1">
              {isRealImage(item.image) ? (
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-11 h-11 rounded-lg object-cover border border-slate-300 shadow-sm shrink-0"
                />
              ) : (
                <span className="text-2xl shrink-0">{item.image}</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-bold text-gray-900 text-sm truncate">{item.name}</p>
                <p className="text-xs text-emerald-700 font-semibold">
                  ${item.price.toFixed(2)} each
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between xs:justify-end space-x-2 shrink-0 pt-1 xs:pt-0 border-t xs:border-t-0 border-slate-200/70">
              <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => updateQuantity(item.id, item.quantity - 1)}
                  className="w-8 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-100 active:bg-slate-200 font-bold text-base"
                  aria-label={`Decrease quantity of ${item.name}`}
                >
                  −
                </button>
                <span className="px-2.5 py-0.5 text-xs font-bold text-slate-900 min-w-[1.75rem] text-center">
                  {item.quantity}
                </span>
                <button
                  type="button"
                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                  className="w-8 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-100 active:bg-slate-200 font-bold text-base"
                  aria-label={`Increase quantity of ${item.name}`}
                >
                  +
                </button>
              </div>

              <div className="text-right min-w-[3.5rem]">
                <p className="text-sm font-extrabold text-gray-900">
                  ${(item.price * item.quantity).toFixed(2)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 text-xs font-bold"
                title="Remove item"
                aria-label={`Remove ${item.name}`}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* POS Modifiers: Member Loyalty Discount & Tax Toggle */}
      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={() => setMemberDiscountOn((prev) => !prev)}
          className={`flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-bold border transition-all ${
            memberDiscountOn
              ? 'bg-amber-100 text-amber-900 border-amber-300'
              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
          }`}
        >
          🏷️ {memberDiscountOn ? '10% Member Applied' : '+ 10% Member Promo'}
        </button>
        <button
          type="button"
          onClick={() => setTaxEnabled((prev) => !prev)}
          className={`py-1.5 px-2.5 rounded-lg text-[11px] font-bold border transition-all ${
            taxEnabled
              ? 'bg-slate-100 text-slate-800 border-slate-300'
              : 'bg-slate-50 text-slate-400 border-slate-200'
          }`}
        >
          {taxEnabled ? '🧾 VAT 7.5% ON' : 'VAT OFF'}
        </button>
      </div>

      {/* Itemized Subtotal, Discount, Tax & Total */}
      <div className="border-t pt-3 space-y-1.5 text-xs sm:text-sm">
        <div className="flex justify-between text-slate-600">
          <span>Subtotal ({itemCount} pcs):</span>
          <span className="font-semibold text-slate-900">${subtotal.toFixed(2)}</span>
        </div>
        {discountAmount > 0 && (
          <div className="flex justify-between text-amber-700 font-semibold">
            <span>Member Discount (10%):</span>
            <span>−${discountAmount.toFixed(2)}</span>
          </div>
        )}
        {taxEnabled && (
          <div className="flex justify-between text-slate-500 text-xs">
            <span>Estimated VAT (7.5%):</span>
            <span>+${taxAmount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between items-center text-xl sm:text-2xl font-extrabold text-gray-900 bg-emerald-50 p-3 rounded-xl border border-emerald-200 mt-1">
          <span>TOTAL:</span>
          <span className="text-emerald-700">${finalTotal.toFixed(2)}</span>
        </div>
      </div>

      {/* Payment Method Selector */}
      <div className="grid grid-cols-3 gap-1.5 pt-1">
        {(['POS Card', 'Cash', 'Transfer'] as const).map((method) => (
          <button
            key={method}
            type="button"
            onClick={() => setPaymentMethod(method)}
            className={`min-h-[40px] py-2 px-2 rounded-lg text-xs font-bold border transition-all active:scale-[0.98] ${
              paymentMethod === method
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {method === 'POS Card' ? '💳 Card' : method === 'Cash' ? '💵 Cash' : '🏦 Transfer'}
          </button>
        ))}
      </div>

      {/* Cash Tendered & Change Calculator */}
      {paymentMethod === 'Cash' && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-2.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-amber-950">💵 Cash Tendered:</span>
            <span className="font-extrabold text-emerald-700">
              Change Due: ${changeDue.toFixed(2)}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setCashTendered(finalTotal)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                cashTendered === null || cashTendered === finalTotal
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-white text-slate-700 border-amber-300'
              }`}
            >
              Exact (${finalTotal.toFixed(2)})
            </button>
            {quickCashOptions.map((bill) => (
              <button
                key={bill}
                type="button"
                onClick={() => setCashTendered(bill)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                  cashTendered === bill
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-white text-slate-700 border-amber-300'
                }`}
              >
                ${bill}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={isProcessingPayment}
        onClick={handleCheckout}
        className="w-full min-h-[48px] py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 active:scale-[0.99] text-white font-extrabold rounded-xl shadow-lg transition-all text-sm sm:text-base"
      >
        {isProcessingPayment
          ? '⏳ Contacting POS Bank Terminal...'
          : `✅ Complete Payment ($${finalTotal.toFixed(2)})`}
      </button>
    </>
  );

  return (
    <>
      <div id="pos-register-card" className="card space-y-4">
        <div className="flex items-center justify-between border-b pb-3 gap-2">
          <div className="min-w-0">
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 truncate">🛒 POS Register</h3>
            <p className="text-xs text-gray-500 truncate">Term #04 • Auto-adds on scan</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {salesHistory.length > 0 && (
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 font-bold px-2.5 py-1.5 rounded-lg border border-indigo-200"
                title="View Shift Sales & Receipts"
              >
                🧾 Sales ({salesHistory.length})
              </button>
            )}
            {items.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                className="text-xs text-rose-600 hover:text-rose-800 font-semibold px-2 py-1.5 rounded-lg hover:bg-rose-50"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-6 sm:py-8 text-gray-500">
            <div className="text-3xl sm:text-4xl mb-2">🛒</div>
            <p className="font-medium text-gray-700 text-sm sm:text-base">Register Ready for Next Customer</p>
            <p className="text-xs text-gray-500 mt-1">
              Scan any product with the camera or tap a Quick-Key — it beeps and adds here automatically!
            </p>
            {salesHistory.length > 0 && (
              <p className="text-xs font-bold text-emerald-700 mt-3 bg-emerald-50 inline-block px-3 py-1 rounded-full border border-emerald-200">
                Shift Total: ${shiftRevenue.toFixed(2)} ({salesHistory.length} receipts)
              </p>
            )}
          </div>
        ) : (
          renderCartItemsAndControls()
        )}
      </div>

      {/* Mobile Sticky Bottom Checkout Bar (visible on mobile/tablet when cart has items) */}
      {items.length > 0 && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 py-2.5 shadow-[0_-8px_25px_rgba(0,0,0,0.1)]">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              className="flex items-center space-x-2.5 text-left min-w-0 flex-1 py-1"
            >
              <div className="relative bg-indigo-600 text-white w-10 h-10 rounded-xl flex items-center justify-center shadow-sm shrink-0">
                <span className="text-lg">🛒</span>
                <span className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-white text-[11px] font-extrabold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white">
                  {itemCount}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-indigo-600 flex items-center gap-1">
                  <span>Tap to view register</span>
                  <span>▲</span>
                </p>
                <p className="text-base font-extrabold text-slate-900 truncate">
                  ${finalTotal.toFixed(2)}
                </p>
              </div>
            </button>

            <button
              type="button"
              disabled={isProcessingPayment}
              onClick={handleCheckout}
              className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold px-4 py-2.5 rounded-xl shadow-md text-xs sm:text-sm shrink-0"
            >
              {isProcessingPayment ? '⏳ Processing...' : `✅ Pay $${finalTotal.toFixed(2)}`}
            </button>
          </div>
        </div>
      )}

      {/* Mobile Slide-Up Cart Drawer */}
      {mobileDrawerOpen && items.length > 0 && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center">
          <div className="bg-white w-full max-h-[88vh] rounded-t-3xl p-4 sm:p-6 shadow-2xl border-t border-slate-200 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">🛒 POS Register ({itemCount})</h3>
                <p className="text-xs text-slate-500">Review items, cash change, or checkout</p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    clearCart();
                    setMobileDrawerOpen(false);
                  }}
                  className="text-xs text-rose-600 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-rose-50"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 font-bold flex items-center justify-center"
                  aria-label="Close cart drawer"
                >
                  ✕
                </button>
              </div>
            </div>

            {renderCartItemsAndControls()}
          </div>
        </div>
      )}

      {/* Shift Sales History Modal */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h4 className="font-extrabold text-base sm:text-lg text-slate-900">📊 Shift Sales Log</h4>
                <p className="text-xs text-slate-500">
                  {salesHistory.length} transactions • Total Revenue: ${shiftRevenue.toFixed(2)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 font-bold flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 max-h-96 overflow-y-auto">
              {salesHistory.map((rec) => (
                <div
                  key={rec.id}
                  onClick={() => {
                    setLastReceipt(rec);
                    setHistoryOpen(false);
                    setReceiptOpen(true);
                  }}
                  className="p-3 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 cursor-pointer transition-all flex items-center justify-between"
                >
                  <div>
                    <p className="font-bold text-sm text-slate-900">
                      {rec.id} <span className="text-xs font-normal text-slate-500">• {rec.time}</span>
                    </p>
                    <p className="text-xs text-slate-600">
                      {rec.items.reduce((s, i) => s + i.quantity, 0)} items • {rec.method}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-extrabold text-emerald-700 text-sm">${rec.total.toFixed(2)}</p>
                    <p className="text-[11px] text-indigo-600 font-semibold">View Receipt →</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Authentic Supermarket Thermal Paper Receipt Modal */}
      {receiptOpen && lastReceipt && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full max-h-[92vh] overflow-y-auto p-5 sm:p-6 shadow-2xl border border-slate-200 font-mono text-slate-900 space-y-3.5">
            <div className="text-center border-b-2 border-dashed border-slate-300 pb-3">
              <div className="text-2xl mb-1 font-sans">🧾</div>
              <h4 className="font-extrabold text-base tracking-tight">PROSCAN SUPERMARKET POS</h4>
              <p className="text-[11px] text-slate-500">100 Market Square Ave • Self &amp; Express Lane</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{lastReceipt.cashier}</p>
              <p className="text-[11px] text-slate-600 font-bold mt-1">
                {lastReceipt.id} • {lastReceipt.date} {lastReceipt.time}
              </p>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto text-xs border-b-2 border-dashed border-slate-300 pb-3">
              <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase pb-1">
                <span>QTY / ITEM</span>
                <span>AMOUNT</span>
              </div>
              {lastReceipt.items.map((it) => (
                <div key={it.id} className="flex justify-between gap-2">
                  <span className="truncate">
                    {it.quantity}x {it.name} <span className="text-slate-400">(@${it.price.toFixed(2)})</span>
                  </span>
                  <span className="font-bold shrink-0">${(it.price * it.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1 text-xs border-b-2 border-dashed border-slate-300 pb-3">
              <div className="flex justify-between text-slate-600">
                <span>SUBTOTAL</span>
                <span>${lastReceipt.subtotal.toFixed(2)}</span>
              </div>
              {lastReceipt.discount > 0 && (
                <div className="flex justify-between text-amber-700 font-bold">
                  <span>MEMBER PROMO (10%)</span>
                  <span>−${lastReceipt.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-600">
                <span>VAT (7.5%)</span>
                <span>${lastReceipt.tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base font-extrabold text-emerald-700 pt-1">
                <span>TOTAL PAID</span>
                <span>${lastReceipt.total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[11px] text-slate-600 pt-1">
                <span>PAYMENT ({lastReceipt.method.toUpperCase()})</span>
                <span>${(lastReceipt.amountTendered ?? lastReceipt.total).toFixed(2)}</span>
              </div>
              {lastReceipt.method === 'Cash' && (lastReceipt.changeDue ?? 0) > 0 && (
                <div className="flex justify-between text-xs font-bold text-slate-900">
                  <span>CHANGE DUE</span>
                  <span>${(lastReceipt.changeDue ?? 0).toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* Simulated Receipt Barcode Graphic */}
            <div className="text-center pt-1">
              <div
                aria-hidden="true"
                className="mx-auto h-9 w-48 bg-[repeating-linear-gradient(90deg,#0f172a,#0f172a_2px,transparent_2px,transparent_4px,#0f172a_4px,#0f172a_5px,transparent_5px,transparent_8px)] opacity-85"
              />
              <p className="text-[10px] tracking-[0.25em] text-slate-500 mt-1">
                *{lastReceipt.id.replace('-', '')}*
              </p>
              <p className="text-[11px] font-sans font-semibold text-slate-500 mt-1">
                Thank you for shopping with Proscan!
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 font-sans">
              <button
                type="button"
                onClick={() => typeof window !== 'undefined' && window.print()}
                className="min-h-[42px] py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs sm:text-sm"
              >
                🖨️ Print Receipt
              </button>
              <button
                type="button"
                onClick={() => setReceiptOpen(false)}
                className="min-h-[42px] py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs sm:text-sm"
              >
                Next Customer →
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
